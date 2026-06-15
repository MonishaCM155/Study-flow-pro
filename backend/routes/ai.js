// routes/ai.js — Smart prioritization, AI study planner, performance prediction, NLP parsing
import { Router } from 'express';
import authMiddleware from '../middleware/auth.js';
import { all, fromJson } from '../db.js';
import { prioritizeTasks, generateStudyPlan, predictPerformance, parseTaskFromText } from '../services/ai.js';

const router = Router();

function loadTasks(userId) {
  return all('SELECT * FROM tasks WHERE user_id=?', [userId]).map(t => ({
    ...t,
    tags: fromJson(t.tags, []),
    subtasks: fromJson(t.subtasks, []),
    updatedAt: t.updated_at,
    createdAt: t.created_at,
  }));
}

/* GET /api/ai/priorities — tasks ranked by AI focus score */
router.get('/priorities', authMiddleware, (req, res) => {
  try {
    const tasks = loadTasks(req.user.id);
    const prioritized = prioritizeTasks(tasks);
    res.json({
      tasks: prioritized.map(t => ({
        id: t.id, title: t.title, subject: t.subject, priority: t.priority,
        deadline: t.deadline, status: t.status, focusScore: t.focusScore, focusReason: t.focusReason,
      })),
      topPick: prioritized[0] || null,
    });
  } catch (err) {
    console.error('[AI/priorities]', err);
    res.status(500).json({ error: 'Failed to compute priorities' });
  }
});

/* POST /api/ai/study-plan — generate a multi-day study schedule */
router.post('/study-plan', authMiddleware, (req, res) => {
  try {
    const tasks = loadTasks(req.user.id);
    const dailyMinutes = Math.max(15, Math.min(600, Number(req.body.dailyMinutes) || 120));
    const days = Math.max(1, Math.min(30, Number(req.body.days) || 7));
    const result = generateStudyPlan({ tasks, dailyMinutes, days });
    res.json(result);
  } catch (err) {
    console.error('[AI/study-plan]', err);
    res.status(500).json({ error: 'Failed to generate study plan' });
  }
});

/* GET /api/ai/performance — predicted performance per subject */
router.get('/performance', authMiddleware, (req, res) => {
  try {
    const tasks = loadTasks(req.user.id);
    const predictions = predictPerformance(tasks);
    const overall = predictions.length
      ? Math.round(predictions.reduce((s, p) => s + p.score, 0) / predictions.length)
      : 0;
    res.json({ predictions, overall });
  } catch (err) {
    console.error('[AI/performance]', err);
    res.status(500).json({ error: 'Failed to predict performance' });
  }
});

/* POST /api/ai/parse-task — NLP parsing for voice/quick-add input */
router.post('/parse-task', authMiddleware, (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    const parsed = parseTaskFromText(text.trim());
    res.json({ parsed });
  } catch (err) {
    console.error('[AI/parse-task]', err);
    res.status(500).json({ error: 'Failed to parse task' });
  }
});

export default router;
