// db.js — Pure-JS SQLite via sql.js (no native binaries required)
// Production: swap for pg (PostgreSQL) by changing the query helpers below.
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, process.env.DB_FILE || './studyflow.db');

let _db = null;
let _saveTimer = null;

/* ── INITIALISE ─────────────────────────────── */
export async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    _db = new SQL.Database();
    console.log('[DB] Created new database at', DB_PATH);
  }

  runMigrations();
  persist(); // initial save

  // Auto-save every 30 seconds
  setInterval(persist, 30000);

  return _db;
}

function getDb() {
  if (!_db) throw new Error('Database not initialised — call initDb() first');
  return _db;
}

/* ── PERSIST TO DISK ────────────────────────── */
export function persist() {
  if (!_db) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const data = _db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.warn('[DB] Persist failed:', e.message);
    }
  }, 200);
}

/* ── QUERY HELPERS ──────────────────────────── */
export function run(sql, params = []) {
  getDb().run(sql, params);
  persist();
}

export function get(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function all(sql, params = []) {
  const stmt = getDb().prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function exec(sql) {
  getDb().exec(sql);
  persist();
}

/* ── JSON HELPERS ───────────────────────────── */
export const toJson = v => JSON.stringify(v ?? []);
export const fromJson = (v, fb = []) => { try { return JSON.parse(v); } catch { return fb; } };

/* ── MIGRATIONS ─────────────────────────────── */
function runMigrations() {
  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      role      TEXT DEFAULT 'Student',
      avatar    TEXT,
      subjects  TEXT DEFAULT '[]',
      goals     TEXT DEFAULT '[]',
      streak    INTEGER DEFAULT 0,
      push_sub  TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      subject     TEXT DEFAULT 'Personal',
      priority    TEXT DEFAULT 'medium',
      status      TEXT DEFAULT 'todo',
      deadline    TEXT NOT NULL,
      estimate    INTEGER DEFAULT 45,
      tracked     INTEGER DEFAULT 0,
      assignee    TEXT DEFAULT '',
      tags        TEXT DEFAULT '[]',
      subtasks    TEXT DEFAULT '[]',
      recurrence  TEXT DEFAULT 'none',
      user_id     TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      when_time  TEXT NOT NULL,
      repeat     TEXT DEFAULT 'once',
      active     INTEGER DEFAULT 1,
      fired      INTEGER DEFAULT 0,
      task_id    TEXT,
      user_id    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      content    TEXT DEFAULT '',
      user_id    TEXT UNIQUE NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friend_invites (
      id          TEXT PRIMARY KEY,
      sender_id   TEXT NOT NULL,
      receiver_id TEXT,
      email       TEXT NOT NULL,
      name        TEXT NOT NULL,
      group_name  TEXT DEFAULT '',
      status      TEXT DEFAULT 'pending',
      token       TEXT UNIQUE NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id         TEXT PRIMARY KEY,
      user_a_id  TEXT NOT NULL,
      user_b_id  TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_a_id, user_b_id),
      FOREIGN KEY(user_a_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user_b_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      room       TEXT DEFAULT 'global',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ── Gamification: XP ledger ──────────────────────────
    CREATE TABLE IF NOT EXISTS xp_events (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      reason     TEXT NOT NULL,
      meta       TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ── Gamification: badges catalogue + unlocks ─────────
    CREATE TABLE IF NOT EXISTS badges (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL,
      icon        TEXT DEFAULT '🏆',
      tier        TEXT DEFAULT 'bronze'
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      badge_id   TEXT NOT NULL,
      unlocked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(badge_id) REFERENCES badges(id) ON DELETE CASCADE
    );

    -- ── Pomodoro session log (for analytics) ─────────────
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      task_id     TEXT,
      duration    INTEGER NOT NULL,      -- planned minutes
      completed   INTEGER DEFAULT 1,     -- 1 = finished fully, 0 = stopped early
      subject     TEXT DEFAULT '',
      started_at  TEXT DEFAULT (datetime('now')),
      ended_at    TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ── Flashcards + spaced repetition (SM-2 lite) ───────
    CREATE TABLE IF NOT EXISTS flashcards (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      task_id      TEXT,
      subject      TEXT DEFAULT 'Personal',
      front        TEXT NOT NULL,
      back         TEXT NOT NULL,
      ease         REAL DEFAULT 2.5,
      interval_days INTEGER DEFAULT 0,
      repetitions  INTEGER DEFAULT 0,
      due_at       TEXT DEFAULT (datetime('now')),
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Seed default badge catalogue (idempotent)
  const existing = all('SELECT id FROM badges');
  if (existing.length === 0) {
    const seedBadges = [
      ['first_task','First Steps','Create your very first task','🌱','bronze'],
      ['ten_tasks','Getting Things Done','Complete 10 tasks','✅','bronze'],
      ['fifty_tasks','Productivity Machine','Complete 50 tasks','🏭','silver'],
      ['hundred_tasks','Centurion','Complete 100 tasks','💯','gold'],
      ['streak_3','On a Roll','Maintain a 3-day study streak','🔥','bronze'],
      ['streak_7','Week Warrior','Maintain a 7-day study streak','⚡','silver'],
      ['streak_30','Unstoppable','Maintain a 30-day study streak','🚀','gold'],
      ['pomodoro_10','Focus Apprentice','Complete 10 Pomodoro sessions','🍅','bronze'],
      ['pomodoro_50','Focus Master','Complete 50 Pomodoro sessions','🧘','silver'],
      ['early_bird','Early Bird','Complete a task before 8am','🌅','bronze'],
      ['night_owl','Night Owl','Complete a task after 11pm','🦉','bronze'],
      ['flashcard_10','Card Collector','Create 10 flashcards','🗂️','bronze'],
      ['flashcard_master','Spaced Repetition Pro','Review 100 flashcards','🧠','gold'],
      ['social_butterfly','Social Butterfly','Invite 3 friends','🦋','silver'],
      ['perfect_week','Perfect Week','Complete every task due in a week','👑','gold'],
      ['level_5','Rising Scholar','Reach level 5','⭐','silver'],
      ['level_10','Dean\u2019s List','Reach level 10','🎓','gold'],
    ];
    for (const [id,name,description,icon,tier] of seedBadges) {
      run('INSERT OR IGNORE INTO badges(id,name,description,icon,tier) VALUES(?,?,?,?,?)',[id,name,description,icon,tier]);
    }
    console.log('[DB] Seeded badge catalogue');
  }

  // Safe ALTERs for columns added after initial release (sql.js has no IF NOT EXISTS for columns)
  const alterIfMissing = (table, col, ddl) => {
    try {
      const cols = all(`PRAGMA table_info(${table})`);
      if (!cols.some(c => c.name === col)) {
        exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        console.log(`[DB] Added column ${table}.${col}`);
      }
    } catch (e) { console.warn(`[DB] alter ${table}.${col} failed:`, e.message); }
  };
  alterIfMissing('users','xp',"xp INTEGER DEFAULT 0");
  alterIfMissing('users','level',"level INTEGER DEFAULT 1");
  alterIfMissing('users','last_active',"last_active TEXT");
  alterIfMissing('tasks','ai_priority_score',"ai_priority_score REAL DEFAULT 0");

  console.log('[DB] Migrations complete');
}
