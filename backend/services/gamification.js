// services/gamification.js — XP, Levels, Badges, Streaks
import { run, get, all } from '../db.js';
import { v4 as uuid } from 'uuid';

/* ── LEVEL CURVE ──────────────────────────────────
   Level N requires N*100 + (N-1)*50 cumulative XP (gentle ramp)
   L1: 0, L2: 100, L3: 250, L4: 450, L5: 700, L6: 1000 ... */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 2; i <= level; i++) total += 100 + (i - 2) * 50;
  return total;
}

export function levelForXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function levelProgress(xp) {
  const level = levelForXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - cur;
  const into = xp - cur;
  return {
    level,
    xp,
    currentLevelXp: cur,
    nextLevelXp: next,
    progressPct: span > 0 ? Math.round((into / span) * 100) : 100,
    xpToNext: Math.max(next - xp, 0),
  };
}

const XP_REASONS = {
  task_completed_low: 10,
  task_completed_medium: 20,
  task_completed_high: 35,
  task_completed_early: 15, // bonus for finishing before deadline
  subtask_completed: 5,
  pomodoro_completed: 8,
  streak_day: 12,
  friend_invited: 25,
  flashcard_created: 3,
  flashcard_reviewed: 2,
  note_saved: 1,
};

/**
 * Award XP to a user, update their level, and check for newly-unlocked badges.
 * Returns { xpAwarded, newTotal, leveledUp, newLevel, unlockedBadges }
 */
export function awardXp(userId, reasonKey, meta = {}) {
  const amount = XP_REASONS[reasonKey] ?? 0;
  if (amount <= 0) return { xpAwarded: 0, newTotal: getUserXp(userId), leveledUp: false, unlockedBadges: [] };

  run('INSERT INTO xp_events(id,user_id,amount,reason,meta) VALUES(?,?,?,?,?)',
    [uuid(), userId, amount, reasonKey, JSON.stringify(meta)]);

  const user = get('SELECT xp, level FROM users WHERE id=?', [userId]);
  const newTotal = (user?.xp || 0) + amount;
  const oldLevel = user?.level || 1;
  const newLevel = levelForXp(newTotal);
  const leveledUp = newLevel > oldLevel;

  run('UPDATE users SET xp=?, level=? WHERE id=?', [newTotal, newLevel, userId]);

  const unlockedBadges = checkAndUnlockBadges(userId, { newLevel, leveledUp });

  return { xpAwarded: amount, newTotal, leveledUp, oldLevel, newLevel, unlockedBadges };
}

export function getUserXp(userId) {
  return get('SELECT xp FROM users WHERE id=?', [userId])?.xp || 0;
}

/* ── STREAK LOGIC ─────────────────────────────────
   Call on any "study activity" (task completed, pomodoro done, note saved).
   If last_active was yesterday -> streak+1. If today -> no change.
   If older -> reset to 1. Awards XP for streak continuation. */
export function touchStreak(userId) {
  const user = get('SELECT streak, last_active FROM users WHERE id=?', [userId]);
  if (!user) return { streak: 0, changed: false };

  const today = new Date().toISOString().slice(0, 10);
  const last = user.last_active ? user.last_active.slice(0, 10) : null;

  if (last === today) return { streak: user.streak || 0, changed: false };

  let newStreak;
  if (last) {
    const lastDate = new Date(last + 'T00:00:00Z');
    const todayDate = new Date(today + 'T00:00:00Z');
    const diffDays = Math.round((todayDate - lastDate) / 86400000);
    newStreak = diffDays === 1 ? (user.streak || 0) + 1 : 1;
  } else {
    newStreak = 1;
  }

  run('UPDATE users SET streak=?, last_active=? WHERE id=?', [newStreak, today, userId]);

  let xpResult = null;
  if (newStreak > 1) xpResult = awardXp(userId, 'streak_day', { streak: newStreak });

  const unlockedBadges = [
    ...checkAndUnlockBadges(userId, { streak: newStreak }),
    ...(xpResult?.unlockedBadges || []),
  ];

  return { streak: newStreak, changed: true, xpResult, unlockedBadges };
}

/* ── BADGE CHECKING ───────────────────────────────
   Checks relevant badge conditions based on context hints, unlocks new ones. */
export function checkAndUnlockBadges(userId, ctx = {}) {
  const unlocked = [];
  const already = new Set(all('SELECT badge_id FROM user_badges WHERE user_id=?', [userId]).map(b => b.badge_id));

  const tryUnlock = (badgeId) => {
    if (already.has(badgeId)) return;
    const badge = get('SELECT * FROM badges WHERE id=?', [badgeId]);
    if (!badge) return;
    run('INSERT OR IGNORE INTO user_badges(id,user_id,badge_id) VALUES(?,?,?)', [uuid(), userId, badgeId]);
    already.add(badgeId);
    unlocked.push(badge);
  };

  // Task-count badges
  const completedCount = get(`SELECT COUNT(*) AS c FROM tasks WHERE user_id=? AND status='completed'`, [userId])?.c || 0;
  if (completedCount >= 1) tryUnlock('first_task');
  if (completedCount >= 10) tryUnlock('ten_tasks');
  if (completedCount >= 50) tryUnlock('fifty_tasks');
  if (completedCount >= 100) tryUnlock('hundred_tasks');

  // Streak badges
  const streak = ctx.streak ?? get('SELECT streak FROM users WHERE id=?', [userId])?.streak ?? 0;
  if (streak >= 3) tryUnlock('streak_3');
  if (streak >= 7) tryUnlock('streak_7');
  if (streak >= 30) tryUnlock('streak_30');

  // Pomodoro badges
  const pomoCount = get(`SELECT COUNT(*) AS c FROM pomodoro_sessions WHERE user_id=? AND completed=1`, [userId])?.c || 0;
  if (pomoCount >= 10) tryUnlock('pomodoro_10');
  if (pomoCount >= 50) tryUnlock('pomodoro_50');

  // Time-of-day badges
  if (ctx.completedAtHour !== undefined) {
    if (ctx.completedAtHour < 8) tryUnlock('early_bird');
    if (ctx.completedAtHour >= 23) tryUnlock('night_owl');
  }

  // Flashcard badges
  const fcCount = get(`SELECT COUNT(*) AS c FROM flashcards WHERE user_id=?`, [userId])?.c || 0;
  if (fcCount >= 10) tryUnlock('flashcard_10');
  const fcReviewed = get(`SELECT COALESCE(SUM(repetitions),0) AS c FROM flashcards WHERE user_id=?`, [userId])?.c || 0;
  if (fcReviewed >= 100) tryUnlock('flashcard_master');

  // Social badges
  const inviteCount = get(`SELECT COUNT(*) AS c FROM friend_invites WHERE sender_id=?`, [userId])?.c || 0;
  if (inviteCount >= 3) tryUnlock('social_butterfly');

  // Level badges
  const level = ctx.newLevel ?? get('SELECT level FROM users WHERE id=?', [userId])?.level ?? 1;
  if (level >= 5) tryUnlock('level_5');
  if (level >= 10) tryUnlock('level_10');

  return unlocked;
}

export function getProfile(userId) {
  const user = get('SELECT xp, level, streak FROM users WHERE id=?', [userId]);
  const progress = levelProgress(user?.xp || 0);
  const badges = all(`
    SELECT b.*, ub.unlocked_at FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id=? ORDER BY ub.unlocked_at DESC
  `, [userId]);
  const allBadges = all('SELECT * FROM badges ORDER BY tier, name');
  const recentXp = all('SELECT * FROM xp_events WHERE user_id=? ORDER BY created_at DESC LIMIT 10', [userId]);

  return {
    ...progress,
    streak: user?.streak || 0,
    badges,
    lockedBadges: allBadges.filter(b => !badges.some(ub => ub.id === b.id)),
    totalBadges: allBadges.length,
    recentXp,
  };
}
