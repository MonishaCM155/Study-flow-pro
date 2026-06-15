// routes/tasks.js — sql.js version
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { run, get, all, toJson, fromJson } from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { awardXp, touchStreak, checkAndUnlockBadges } from '../services/gamification.js';
import { prioritizeTasks } from '../services/ai.js';

const router = Router();

function serializeTask(t) {
  if (!t) return null;
  return { ...t, tags:fromJson(t.tags,[]), subtasks:fromJson(t.subtasks,[]),
    deadline:t.deadline, createdAt:t.created_at, updatedAt:t.updated_at };
}

/* LIST */
router.get('/', authMiddleware, (req,res) => {
  try {
    let tasks = all('SELECT * FROM tasks WHERE user_id=? ORDER BY deadline ASC', [req.user.id]);
    const {subject, status, priority, q} = req.query;
    if (subject && subject !== 'All') tasks = tasks.filter(t => t.subject===subject);
    if (status) tasks = tasks.filter(t => t.status===status);
    if (priority) tasks = tasks.filter(t => t.priority===priority);
    if (q) { const ql=q.toLowerCase(); tasks=tasks.filter(t=>[t.title,t.description,t.subject,...fromJson(t.tags,[])].join(' ').toLowerCase().includes(ql)); }
    res.json({tasks:tasks.map(serializeTask)});
  } catch(err){res.status(500).json({error:'Failed to fetch tasks'});}
});

/* CREATE */
router.post('/', authMiddleware, (req,res) => {
  const {title,description,subject,priority,deadline,estimate,assignee,tags,recurrence} = req.body;
  if (!title?.trim()) return res.status(400).json({error:'Title required'});
  if (!deadline) return res.status(400).json({error:'Deadline required'});
  try {
    const id = uuid();
    run(`INSERT INTO tasks(id,title,description,subject,priority,deadline,estimate,assignee,tags,recurrence,user_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [id, title.trim(), description||'', subject||'Personal', priority||'medium',
       new Date(deadline).toISOString(), estimate||45, assignee||'', toJson(tags||[]), recurrence||'none', req.user.id]);
    const task = get('SELECT * FROM tasks WHERE id=?',[id]);
    const unlockedBadges = checkAndUnlockBadges(req.user.id, {});
    res.status(201).json({task:serializeTask(task), gamification: unlockedBadges.length ? { unlockedBadges } : null});
  } catch(err){console.error('[Tasks/create]',err);res.status(500).json({error:'Failed to create task'});}
});

/* UPDATE */
router.put('/:id', authMiddleware, (req,res) => {
  try {
    const existing = get('SELECT * FROM tasks WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if (!existing) return res.status(404).json({error:'Task not found'});
    const {title,description,subject,priority,status,deadline,estimate,tracked,assignee,tags,subtasks,recurrence} = req.body;
    const sets=[], params=[];
    if (title!==undefined){sets.push('title=?');params.push(title);}
    if (description!==undefined){sets.push('description=?');params.push(description);}
    if (subject!==undefined){sets.push('subject=?');params.push(subject);}
    if (priority!==undefined){sets.push('priority=?');params.push(priority);}
    if (status!==undefined){sets.push('status=?');params.push(status);}
    if (deadline!==undefined){sets.push('deadline=?');params.push(new Date(deadline).toISOString());}
    if (estimate!==undefined){sets.push('estimate=?');params.push(Number(estimate));}
    if (tracked!==undefined){sets.push('tracked=?');params.push(Number(tracked));}
    if (assignee!==undefined){sets.push('assignee=?');params.push(assignee);}
    if (tags!==undefined){sets.push('tags=?');params.push(toJson(tags));}
    if (subtasks!==undefined){sets.push('subtasks=?');params.push(toJson(subtasks));}
    if (recurrence!==undefined){sets.push('recurrence=?');params.push(recurrence);}
    if (sets.length===0) return res.status(400).json({error:'No fields to update'});
    sets.push("updated_at=datetime('now')");
    params.push(req.params.id);
    run(`UPDATE tasks SET ${sets.join(',')} WHERE id=?`, params);
    const task = get('SELECT * FROM tasks WHERE id=?',[req.params.id]);

    // ── Gamification: award XP when a task transitions to "completed" ──
    let gamification = null;
    if (status === 'completed' && existing.status !== 'completed') {
      const reasonKey = `task_completed_${task.priority || 'medium'}`;
      const xpResult = awardXp(req.user.id, reasonKey);
      const now = new Date();
      const deadline = new Date(task.deadline);
      let earlyXp = null;
      if (now < deadline) earlyXp = awardXp(req.user.id, 'task_completed_early');
      const streakResult = touchStreak(req.user.id);
      const badgeCtx = checkAndUnlockBadges(req.user.id, { completedAtHour: now.getHours() });
      const unlockedBadges = [
        ...(xpResult.unlockedBadges || []),
        ...(earlyXp?.unlockedBadges || []),
        ...(streakResult.unlockedBadges || []),
        ...badgeCtx,
      ];
      // Dedupe badges by id
      const seen = new Set();
      const dedupedBadges = unlockedBadges.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });

      gamification = {
        xpAwarded: xpResult.xpAwarded + (earlyXp?.xpAwarded || 0),
        leveledUp: xpResult.leveledUp || earlyXp?.leveledUp,
        newLevel: earlyXp?.newLevel ?? xpResult.newLevel,
        newTotal: earlyXp?.newTotal ?? xpResult.newTotal,
        streak: streakResult.streak,
        unlockedBadges: dedupedBadges,
      };
    }

    res.json({task:serializeTask(task), gamification});
  } catch(err){console.error('[Tasks/update]',err);res.status(500).json({error:'Failed to update task'});}
});

/* DELETE */
router.delete('/:id', authMiddleware, (req,res) => {
  try {
    const existing = get('SELECT id FROM tasks WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if (!existing) return res.status(404).json({error:'Task not found'});
    run('DELETE FROM tasks WHERE id=?',[req.params.id]);
    res.json({ok:true});
  } catch(err){res.status(500).json({error:'Failed to delete task'});}
});

/* SMART SCHEDULE — sets the highest AI focus-score task to in-progress */
router.post('/smart-schedule', authMiddleware, (req,res) => {
  try {
    const raw = all('SELECT * FROM tasks WHERE user_id=? AND status!=?',[req.user.id,'completed'])
      .map(t => ({...t, tags:fromJson(t.tags,[]), subtasks:fromJson(t.subtasks,[]), updatedAt:t.updated_at}));
    const prioritized = prioritizeTasks(raw);
    if (prioritized.length>0 && prioritized[0].status !== 'in-progress') {
      run('UPDATE tasks SET status=?, updated_at=datetime(\'now\') WHERE id=?',['in-progress',prioritized[0].id]);
    }
    res.json({
      updated: prioritized.length>0 ? 1 : 0,
      topTask: prioritized[0] ? { id:prioritized[0].id, title:prioritized[0].title, focusScore:prioritized[0].focusScore, focusReason:prioritized[0].focusReason } : null,
    });
  } catch(err){console.error('[Tasks/smart-schedule]',err);res.status(500).json({error:'Smart schedule failed'});}
});

export default router;
