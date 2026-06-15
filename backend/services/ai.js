// services/ai.js — Smart Prioritization, Study Planner, Performance Prediction
// Pure rule-based / statistical "AI" — no external API key required.
// Designed to be swappable for a real LLM call later (see studyPlanFromTasks).
import { all, fromJson } from '../db.js';

/* ── SMART TASK PRIORITIZATION ────────────────────
   Computes a 0-100 "focus score" per task based on:
   - Urgency: how close the deadline is (exponential decay)
   - Priority weight: high/medium/low
   - Effort remaining: estimate - tracked (less remaining = quicker win = slight boost)
   - Status: in-progress tasks get a momentum boost
   - Subtask completion: partially-done tasks are closer to finishing
*/
const PRIORITY_WEIGHT = { high: 1.0, medium: 0.65, low: 0.35 };

export function computeFocusScore(task, now = new Date()) {
  const deadline = new Date(task.deadline);
  const hoursLeft = (deadline - now) / 3600000;

  // Urgency: 100 at <=0h, decays to ~10 at 7 days, asymptotic floor at 2
  let urgency;
  if (hoursLeft <= 0) urgency = 100;
  else urgency = Math.max(2, 100 * Math.exp(-hoursLeft / 48));

  const priorityWeight = PRIORITY_WEIGHT[task.priority] ?? 0.5;

  // Effort momentum
  const estimate = Math.max(task.estimate || 45, 1);
  const tracked = task.tracked || 0;
  const remaining = Math.max(estimate - tracked, 0);
  const momentum = tracked > 0 ? Math.min(15, (tracked / estimate) * 20) : 0;

  // Subtask completion boost (subtasks may already be parsed to an array by the caller)
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : fromJson(task.subtasks, []);
  const subtaskBoost = subtasks.length
    ? Math.min(10, (subtasks.filter(s => s.done).length / subtasks.length) * 12)
    : 0;

  // Status boost
  const statusBoost = task.status === 'in-progress' ? 8 : 0;

  // Effort-size penalty: very long remaining tasks slightly deprioritized vs quick wins
  const sizePenalty = remaining > 120 ? -5 : remaining < 30 ? 3 : 0;

  const raw = urgency * 0.55 + priorityWeight * 35 + momentum + subtaskBoost + statusBoost + sizePenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Returns tasks sorted by focus score (desc), each annotated with
 * `focusScore` and a human-readable `focusReason`.
 */
export function prioritizeTasks(tasks, now = new Date()) {
  return tasks
    .filter(t => t.status !== 'completed')
    .map(t => {
      const focusScore = computeFocusScore(t, now);
      const hoursLeft = (new Date(t.deadline) - now) / 3600000;
      let focusReason;
      if (hoursLeft <= 0) focusReason = '⚠️ Overdue — tackle immediately';
      else if (hoursLeft < 24) focusReason = `Due in ${Math.round(hoursLeft)}h — high urgency`;
      else if (t.status === 'in-progress') focusReason = 'Already in progress — keep momentum';
      else if (t.priority === 'high') focusReason = 'High priority subject';
      else if (hoursLeft < 72) focusReason = `Due in ${Math.round(hoursLeft / 24)} day(s)`;
      else focusReason = 'Lower urgency — schedule when free';
      return { ...t, focusScore, focusReason };
    })
    .sort((a, b) => b.focusScore - a.focusScore);
}

/* ── AI STUDY PLANNER ──────────────────────────────
   Given pending tasks + available daily study minutes + days until the
   furthest exam, distributes tasks across days as a study schedule.
   Greedy bin-packing by focus score, respecting deadlines (a task is
   never scheduled after its own deadline). */
export function generateStudyPlan({ tasks, dailyMinutes = 120, days = 7, now = new Date() }) {
  const prioritized = prioritizeTasks(tasks, now);
  const plan = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(0, 0, 0, 0);
    plan.push({ date: date.toISOString().slice(0, 10), dayLabel: date.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }), minutesAvailable: dailyMinutes, blocks: [] });
  }

  // Track remaining effort per task
  const remaining = new Map();
  for (const t of prioritized) {
    const est = Math.max(t.estimate || 45, 15);
    remaining.set(t.id, Math.max(est - (t.tracked || 0), 15));
  }

  // Greedy fill: iterate days, fill with highest-priority tasks whose deadline hasn't passed that day
  for (const day of plan) {
    const dayEnd = new Date(day.date + 'T23:59:59');
    let budget = day.minutesAvailable;

    for (const t of prioritized) {
      if (budget <= 0) break;
      let rem = remaining.get(t.id);
      if (!rem || rem <= 0) continue;
      const deadline = new Date(t.deadline);
      if (deadline < new Date(day.date + 'T00:00:00')) continue; // already overdue for this day, still show but lower priority — handled by sort

      // Allocate a study block, capped at 50 min (Pomodoro-ish) or remaining budget/effort
      const block = Math.min(rem, budget, 50);
      if (block < 10) continue;

      day.blocks.push({
        taskId: t.id,
        title: t.title,
        subject: t.subject,
        priority: t.priority,
        minutes: block,
        focusScore: t.focusScore,
        deadline: t.deadline,
      });
      budget -= block;
      remaining.set(t.id, rem - block);
    }
  }

  // Tasks that couldn't be fully scheduled within `days`
  const unscheduled = prioritized
    .filter(t => (remaining.get(t.id) || 0) > 0)
    .map(t => ({ id: t.id, title: t.title, remainingMinutes: remaining.get(t.id), deadline: t.deadline }));

  const totalPlannedMinutes = plan.reduce((sum, d) => sum + d.blocks.reduce((s, b) => s + b.minutes, 0), 0);

  return { plan, unscheduled, totalPlannedMinutes, generatedAt: new Date().toISOString() };
}

/* ── PERFORMANCE PREDICTION ────────────────────────
   Lightweight heuristic model: predicts a 0-100 "readiness score" per
   subject based on:
   - completion rate of tasks in that subject
   - average lead time before deadline (finishing early = good habit)
   - recent trend (last 7 days vs prior 7 days)
   - study time tracked vs estimated
*/
export function predictPerformance(tasks, now = new Date()) {
  const bySubject = {};
  for (const t of tasks) {
    const s = t.subject || 'Personal';
    if (!bySubject[s]) bySubject[s] = [];
    bySubject[s].push(t);
  }

  const results = [];
  for (const [subject, list] of Object.entries(bySubject)) {
    const total = list.length;
    const completed = list.filter(t => t.status === 'completed');
    const completionRate = total ? completed.length / total : 0;

    // Lead time: for completed tasks, (deadline - updatedAt) in hours, averaged & normalized
    let leadScores = [];
    for (const t of completed) {
      const updated = new Date(t.updatedAt || t.updated_at || t.createdAt);
      const deadline = new Date(t.deadline);
      const leadHours = (deadline - updated) / 3600000;
      // +1 if finished early, scaled; 0 if exactly on time; negative if late
      leadScores.push(Math.max(-1, Math.min(1, leadHours / 24)));
    }
    const avgLead = leadScores.length ? leadScores.reduce((a, b) => a + b, 0) / leadScores.length : 0;

    // Time investment ratio
    const totalEstimate = list.reduce((s, t) => s + (t.estimate || 45), 0);
    const totalTracked = list.reduce((s, t) => s + (t.tracked || 0), 0);
    const timeRatio = totalEstimate > 0 ? Math.min(1.2, totalTracked / totalEstimate) : 0;

    // Recent trend: completions in last 7 days vs previous 7 days
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentCompleted = completed.filter(t => new Date(t.updatedAt || t.updated_at) >= sevenDaysAgo).length;
    const priorCompleted = completed.filter(t => {
      const d = new Date(t.updatedAt || t.updated_at);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    }).length;
    const trend = recentCompleted - priorCompleted; // positive = improving

    // Composite score (0-100)
    let score = completionRate * 50            // up to 50 pts for completion rate
      + Math.max(0, avgLead) * 15               // up to 15 pts for finishing early
      + Math.min(timeRatio, 1) * 25             // up to 25 pts for matching study time estimates
      + Math.max(-10, Math.min(10, trend * 3)); // up to ±10 pts for trend

    score = Math.max(0, Math.min(100, Math.round(score)));

    let band, advice;
    if (score >= 80) { band = 'Excellent'; advice = `Strong performance in ${subject}. Keep up the consistent pace — consider helping peers or tackling advanced material.`; }
    else if (score >= 60) { band = 'On Track'; advice = `Solid progress in ${subject}. Stay consistent and review completed work to retain knowledge.`; }
    else if (score >= 40) { band = 'Needs Attention'; advice = `${subject} could use more focused time. Try scheduling a dedicated study block this week.`; }
    else { band = 'At Risk'; advice = `${subject} is falling behind. Prioritize this subject in your next study session and break large tasks into smaller ones.`; }

    results.push({
      subject,
      score,
      band,
      advice,
      completionRate: Math.round(completionRate * 100),
      tasksTotal: total,
      tasksCompleted: completed.length,
      trend,
      studyHours: Math.round(totalTracked / 60 * 10) / 10,
    });
  }

  return results.sort((a, b) => a.score - b.score); // weakest first (most actionable)
}

/* ── NLP TASK PARSING (lightweight) ───────────────
   Used by voice input / smart add. Extracts subject, priority, deadline
   from free-text like "finish physics lab report by friday 6pm high priority" */
const SUBJECT_KEYWORDS = {
  Mathematics: ['math', 'calculus', 'algebra', 'geometry', 'trig'],
  Physics: ['physics', 'mechanics', 'thermo', 'optics', 'electromagnet'],
  'Computer Science': ['code', 'coding', 'programming', 'algorithm', 'cs', 'software', 'leetcode', 'dsa'],
  English: ['essay', 'english', 'literature', 'writing', 'novel', 'poem'],
  Chemistry: ['chemistry', 'chem', 'organic', 'reaction', 'lab'],
  Personal: [],
};

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export function parseTaskFromText(text, now = new Date()) {
  const low = text.toLowerCase();

  // Subject detection
  let subject = 'Personal';
  for (const [subj, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (keywords.some(k => low.includes(k))) { subject = subj; break; }
  }

  // Priority detection
  let priority = 'medium';
  if (/\b(urgent|asap|high priority|important|critical)\b/.test(low)) priority = 'high';
  else if (/\b(low priority|whenever|someday|minor)\b/.test(low)) priority = 'low';

  // Date detection
  let deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(17, 0, 0, 0);

  if (/\btoday\b/.test(low)) {
    deadline = new Date(now);
    deadline.setHours(20, 0, 0, 0);
  } else if (/\btomorrow\b/.test(low)) {
    deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(17, 0, 0, 0);
  } else {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (low.includes(WEEKDAYS[i])) {
        const target = new Date(now);
        const todayDow = target.getDay();
        let diff = (i - todayDow + 7) % 7;
        if (diff === 0) diff = 7; // "next" occurrence
        target.setDate(target.getDate() + diff);
        target.setHours(17, 0, 0, 0);
        deadline = target;
        break;
      }
    }
  }

  // Time detection (e.g. "6pm", "18:00", "9:30am")
  const timeMatch = low.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    deadline.setHours(hour, minute, 0, 0);
  }

  // Clean title: strip time/date/priority phrases
  let title = text
    .replace(/\b(by\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, '')
    .replace(/\b(urgent|asap|high priority|important|critical|low priority|whenever|someday|minor)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*(at|by|on)\s+/i, '')
    .trim()
    .replace(/[.,;:]\s*$/, '');

  if (!title) title = text.trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, subject, priority, deadline: deadline.toISOString() };
}
