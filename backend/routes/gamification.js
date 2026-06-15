// routes/gamification.js — XP, levels, badges, streaks
import { Router } from 'express';
import authMiddleware from '../middleware/auth.js';
import { all } from '../db.js';
import { getProfile, touchStreak, levelProgress } from '../services/gamification.js';

const router = Router();

/* GET /api/gamification/profile — current user's XP, level, streak, badges */
router.get('/profile', authMiddleware, (req, res) => {
  try {
    const profile = getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    console.error('[Gamification/profile]', err);
    res.status(500).json({ error: 'Failed to load gamification profile' });
  }
});

/* POST /api/gamification/checkin — call once per session/day to register streak activity */
router.post('/checkin', authMiddleware, (req, res) => {
  try {
    const result = touchStreak(req.user.id);
    const profile = getProfile(req.user.id);
    res.json({ ...result, profile });
  } catch (err) {
    console.error('[Gamification/checkin]', err);
    res.status(500).json({ error: 'Checkin failed' });
  }
});

/* GET /api/gamification/leaderboard — top users by XP (global, lightweight) */
router.get('/leaderboard', authMiddleware, (req, res) => {
  try {
    const rows = all(`
      SELECT id, name, avatar, xp, level, streak
      FROM users
      ORDER BY xp DESC, streak DESC
      LIMIT 20
    `);
    const leaderboard = rows.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      xp: u.xp || 0,
      level: u.level || 1,
      streak: u.streak || 0,
      isMe: u.id === req.user.id,
    }));
    res.json({ leaderboard });
  } catch (err) {
    console.error('[Gamification/leaderboard]', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

/* GET /api/gamification/badges — full badge catalogue with lock status */
router.get('/badges', authMiddleware, (req, res) => {
  try {
    const profile = getProfile(req.user.id);
    res.json({ unlocked: profile.badges, locked: profile.lockedBadges, total: profile.totalBadges });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load badges' });
  }
});

export default router;
