// routes/calendar.js — iCalendar (.ics) export for Google Calendar / Outlook / Apple Calendar
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { all, get, fromJson } from '../db.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();

function escapeIcs(str = '') {
  return String(str).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function toIcsDate(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildIcs(tasks, calendarName = 'StudyFlow Pro') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyFlow Pro//Tasks Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const t of tasks) {
    const start = new Date(t.deadline);
    const end = new Date(start.getTime() + (t.estimate || 45) * 60000);
    const subtasks = fromJson(t.subtasks, []);
    const subtaskLines = subtasks.length
      ? '\\n\\nSubtasks:\\n' + subtasks.map(s => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('\\n')
      : '';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@studyflow.pro`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(t.deadline)}`,
      `DTEND:${toIcsDate(end.toISOString())}`,
      `SUMMARY:${escapeIcs(`[${t.subject}] ${t.title}`)}`,
      `DESCRIPTION:${escapeIcs((t.description || '') + subtaskLines)}`,
      `CATEGORIES:${escapeIcs(t.subject || 'Personal')}`,
      `PRIORITY:${t.priority === 'high' ? 1 : t.priority === 'low' ? 9 : 5}`,
      `STATUS:${t.status === 'completed' ? 'COMPLETED' : 'CONFIRMED'}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT30M',
      `DESCRIPTION:${escapeIcs(t.title)} is due soon`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* GET /api/calendar/token — generates a long-lived read-only feed token */
router.get('/token', authMiddleware, (req, res) => {
  const token = jwt.sign({ userId: req.user.id, scope: 'calendar-feed' }, process.env.JWT_SECRET, { expiresIn: '365d' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    token,
    feedUrl: `${baseUrl}/api/calendar/feed.ics?token=${token}`,
    instructions: 'In Google Calendar: Settings → Add calendar → From URL, then paste the feed URL above.',
  });
});

/* GET /api/calendar/export — download .ics of current user's tasks (requires auth header) */
router.get('/export', authMiddleware, (req, res) => {
  try {
    const tasks = all('SELECT * FROM tasks WHERE user_id=? AND status!=?', [req.user.id, 'completed']);
    const ics = buildIcs(tasks);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="studyflow-tasks.ics"');
    res.send(ics);
  } catch (err) {
    console.error('[Calendar/export]', err);
    res.status(500).json({ error: 'Failed to export calendar' });
  }
});

/* GET /api/calendar/feed.ics?token=... — public feed URL (token-based, for Google Calendar subscription) */
router.get('/feed.ics', (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(401).send('Missing token');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== 'calendar-feed') return res.status(403).send('Invalid token scope');

    const tasks = all('SELECT * FROM tasks WHERE user_id=?', [decoded.userId]);
    const user = get('SELECT name FROM users WHERE id=?', [decoded.userId]);
    const ics = buildIcs(tasks, `StudyFlow Pro — ${user?.name || 'My Tasks'}`);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  } catch (err) {
    res.status(401).send('Invalid or expired token');
  }
});

export default router;
