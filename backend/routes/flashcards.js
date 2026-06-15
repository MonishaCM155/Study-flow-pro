// routes/flashcards.js — Flashcards + SM-2-lite spaced repetition
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import authMiddleware from '../middleware/auth.js';
import { run, get, all } from '../db.js';
import { awardXp, checkAndUnlockBadges } from '../services/gamification.js';

const router = Router();

/* GET /api/flashcards — list all (optionally filter by subject/due) */
router.get('/', authMiddleware, (req, res) => {
  try {
    let cards = all('SELECT * FROM flashcards WHERE user_id=? ORDER BY due_at ASC', [req.user.id]);
    const { subject, due } = req.query;
    if (subject && subject !== 'All') cards = cards.filter(c => c.subject === subject);
    if (due === 'true') {
      const now = new Date().toISOString();
      cards = cards.filter(c => c.due_at <= now);
    }
    res.json({ flashcards: cards });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch flashcards' });
  }
});

/* GET /api/flashcards/due-count — quick count for badge/notification */
router.get('/due-count', authMiddleware, (req, res) => {
  try {
    const now = new Date().toISOString();
    const count = get('SELECT COUNT(*) AS c FROM flashcards WHERE user_id=? AND due_at<=?', [req.user.id, now])?.c || 0;
    res.json({ due: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count due cards' });
  }
});

/* POST /api/flashcards — create one or many (bulk via array) */
router.post('/', authMiddleware, (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const created = [];
    for (const item of items) {
      const { front, back, subject, taskId } = item;
      if (!front?.trim() || !back?.trim()) continue;
      const id = uuid();
      run(`INSERT INTO flashcards(id,user_id,task_id,subject,front,back,due_at)
           VALUES(?,?,?,?,?,?,datetime('now'))`,
        [id, req.user.id, taskId || null, subject || 'Personal', front.trim(), back.trim()]);
      created.push(get('SELECT * FROM flashcards WHERE id=?', [id]));
    }
    if (created.length === 0) return res.status(400).json({ error: 'front and back are required' });

    let gamification = null;
    for (let i = 0; i < created.length; i++) {
      const xpResult = awardXp(req.user.id, 'flashcard_created', { flashcardId: created[i].id });
      if (i === created.length - 1) gamification = { xp: xpResult, unlockedBadges: xpResult.unlockedBadges };
    }

    res.status(201).json({ flashcards: created, gamification });
  } catch (err) {
    console.error('[Flashcards/create]', err);
    res.status(500).json({ error: 'Failed to create flashcard(s)' });
  }
});

/* PUT /api/flashcards/:id — edit front/back/subject */
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = get('SELECT id FROM flashcards WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!existing) return res.status(404).json({ error: 'Flashcard not found' });

    const { front, back, subject } = req.body;
    const sets = [], params = [];
    if (front !== undefined) { sets.push('front=?'); params.push(front); }
    if (back !== undefined) { sets.push('back=?'); params.push(back); }
    if (subject !== undefined) { sets.push('subject=?'); params.push(subject); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    run(`UPDATE flashcards SET ${sets.join(',')} WHERE id=?`, params);
    res.json({ flashcard: get('SELECT * FROM flashcards WHERE id=?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update flashcard' });
  }
});

/* DELETE /api/flashcards/:id */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = get('SELECT id FROM flashcards WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!existing) return res.status(404).json({ error: 'Flashcard not found' });
    run('DELETE FROM flashcards WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete flashcard' });
  }
});

/* POST /api/flashcards/generate — auto-generate flashcards from text (notes/task description)
   Heuristic generator: splits on sentences/lines containing definitions, key terms.
   No external API required — looks for patterns like "X is Y", "X: Y", "X = Y". */
router.post('/generate', authMiddleware, (req, res) => {
  try {
    const { text, subject, taskId } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const lines = text.split(/\n|(?<=[.!?])\s+/).map(l => l.trim()).filter(l => l.length > 8);
    const cards = [];

    for (const line of lines) {
      let front, back;
      // Pattern: "Term: Definition" or "Term - Definition" or "Term = Definition"
      let m = line.match(/^(.{2,60}?)\s*[:\-—=]\s*(.{3,300})$/);
      if (m) { front = `What is ${m[1].trim()}?`; back = m[2].trim(); }
      else {
        // Pattern: "X is Y" / "X are Y" / "X refers to Y"
        m = line.match(/^(.{2,60}?)\s+(is|are|refers to|means|represents)\s+(.{3,300})$/i);
        if (m) { front = `What ${m[2].toLowerCase()} ${m[1].trim()}?`; back = m[3].trim().replace(/\.$/, ''); }
      }
      if (front && back) cards.push({ front, back, subject: subject || 'Personal', taskId: taskId || null });
      if (cards.length >= 15) break;
    }

    if (cards.length === 0) {
      return res.json({ flashcards: [], message: 'No clear definitions found. Try formatting notes as "Term: Definition" for best results.' });
    }

    const created = [];
    for (const c of cards) {
      const id = uuid();
      run(`INSERT INTO flashcards(id,user_id,task_id,subject,front,back,due_at) VALUES(?,?,?,?,?,?,datetime('now'))`,
        [id, req.user.id, c.taskId, c.subject, c.front, c.back]);
      created.push(get('SELECT * FROM flashcards WHERE id=?', [id]));
    }

    let gamification = null;
    for (let i = 0; i < created.length; i++) {
      const xpResult = awardXp(req.user.id, 'flashcard_created', {});
      if (i === created.length - 1) gamification = { xp: xpResult, unlockedBadges: xpResult.unlockedBadges };
    }

    res.status(201).json({ flashcards: created, gamification, message: `Generated ${created.length} flashcard(s) from your text.` });
  } catch (err) {
    console.error('[Flashcards/generate]', err);
    res.status(500).json({ error: 'Failed to generate flashcards' });
  }
});

/* POST /api/flashcards/:id/review — SM-2-lite review.
   quality: 0 (forgot) - 5 (perfect recall) */
router.post('/:id/review', authMiddleware, (req, res) => {
  try {
    const card = get('SELECT * FROM flashcards WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!card) return res.status(404).json({ error: 'Flashcard not found' });

    const quality = Math.max(0, Math.min(5, Number(req.body.quality) ?? 3));

    let { ease, interval_days: interval, repetitions } = card;
    ease = ease || 2.5;
    interval = interval || 0;
    repetitions = repetitions || 0;

    if (quality < 3) {
      // Forgot — reset interval, slightly lower ease
      repetitions = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    } else {
      repetitions += 1;
      if (repetitions === 1) interval = 1;
      else if (repetitions === 2) interval = 6;
      else interval = Math.round(interval * ease);
      ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + interval);

    run(`UPDATE flashcards SET ease=?, interval_days=?, repetitions=?, due_at=? WHERE id=?`,
      [ease, interval, repetitions, dueAt.toISOString(), req.params.id]);

    const xpResult = awardXp(req.user.id, 'flashcard_reviewed', { flashcardId: req.params.id, quality });

    res.json({
      flashcard: get('SELECT * FROM flashcards WHERE id=?', [req.params.id]),
      gamification: { xp: xpResult, unlockedBadges: xpResult.unlockedBadges },
    });
  } catch (err) {
    console.error('[Flashcards/review]', err);
    res.status(500).json({ error: 'Failed to record review' });
  }
});

export default router;
