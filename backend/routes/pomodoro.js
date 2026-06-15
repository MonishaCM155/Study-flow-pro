// routes/pomodoro.js — Pomodoro session logging + analytics
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import authMiddleware from '../middleware/auth.js';
import { run, get, all } from '../db.js';
import { awardXp, touchStreak, checkAndUnlockBadges } from '../services/gamification.js';

const router = Router();

/* POST /api/pomodoro/sessions — log a completed (or stopped) session */
router.post('/sessions', authMiddleware, (req, res) => {
  const { taskId, duration, completed, subject } = req.body;
  if (!duration || duration <= 0) return res.status(400).json({ error: 'duration (minutes) required' });

  try {
    const id = uuid();
    const now = new Date().toISOString();
    run(`INSERT INTO pomodoro_sessions(id,user_id,task_id,duration,completed,subject,started_at,ended_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      [id, req.user.id, taskId || null, Math.round(duration), completed ? 1 : 0, subject || '', now, now]);

    let gamification = null;
    if (completed) {
      const xpResult = awardXp(req.user.id, 'pomodoro_completed', { taskId, duration });
      const streakResult = touchStreak(req.user.id);
      const badges = [...(xpResult.unlockedBadges || []), ...(streakResult.unlockedBadges || [])];
      gamification = { xp: xpResult, streak: streakResult.streak, unlockedBadges: badges };
    }

    res.status(201).json({ session: get('SELECT * FROM pomodoro_sessions WHERE id=?', [id]), gamification });
  } catch (err) {
    console.error('[Pomodoro/sessions]', err);
    res.status(500).json({ error: 'Failed to log session' });
  }
});

/* GET /api/pomodoro/analytics — daily totals for the last N days + subject breakdown */
router.get('/analytics', authMiddleware, (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessions = all(
      `SELECT * FROM pomodoro_sessions WHERE user_id=? AND started_at >= ? ORDER BY started_at ASC`,
      [req.user.id, since.toISOString()]
    );

    // Daily totals
    const dailyMap = {};
    for (const s of sessions) {
      const day = s.started_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { date: day, minutes: 0, sessions: 0, completed: 0 };
      dailyMap[day].minutes += s.duration;
      dailyMap[day].sessions += 1;
      if (s.completed) dailyMap[day].completed += 1;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Subject breakdown
    const subjectMap = {};
    for (const s of sessions) {
      const subj = s.subject || 'Other';
      subjectMap[subj] = (subjectMap[subj] || 0) + s.duration;
    }
    const bySubject = Object.entries(subjectMap).map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.completed).length;

    res.json({
      daily,
      bySubject,
      totals: { totalMinutes, totalSessions, completedSessions, days },
    });
  } catch (err) {
    console.error('[Pomodoro/analytics]', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

export default router;
