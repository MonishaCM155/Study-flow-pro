// setup.js — StudyFlow Pro v2 First-Time Setup
// Run once: node setup.js
// Uses sql.js (same as the actual server) — no Prisma needed.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const c = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};
const step = (n, msg) => console.log(c.cyan(`\n[${n}] `) + c.bold(msg));
const ok   = msg => console.log(c.green('    ✓ ') + msg);
const warn = msg => console.log(c.yellow('    ⚠ ') + msg);

console.log(c.bold(`
╔══════════════════════════════════════════════╗
║     StudyFlow Pro v2 — First-Time Setup      ║
╚══════════════════════════════════════════════╝
`));

// ── Step 1: Create .env ───────────────────────
step(1, 'Environment configuration');
const envPath = path.join(__dirname, '.env');
const envExPath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(envExPath, envPath);
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  let envContent = fs.readFileSync(envPath, 'utf-8');
  envContent = envContent.replace('your-super-secret-jwt-key-change-this-in-production-please', jwtSecret);
  fs.writeFileSync(envPath, envContent);
  ok('.env created with auto-generated JWT secret');
} else {
  ok('.env already exists');
}

// ── Step 2: Generate VAPID keys ───────────────
step(2, 'VAPID keys for Web Push');
try {
  const { generateVAPIDKeys } = await import('web-push');
  const keys = generateVAPIDKeys();
  let envContent = fs.readFileSync(envPath, 'utf-8');
  if (envContent.includes('your-vapid-public-key')) {
    envContent = envContent
      .replace('your-vapid-public-key', keys.publicKey)
      .replace('your-vapid-private-key', keys.privateKey);
    fs.writeFileSync(envPath, envContent);
    ok('VAPID keys generated and saved');
  } else {
    ok('VAPID keys already configured');
  }
} catch (e) {
  warn('VAPID skipped: ' + e.message);
}

// ── Step 3: Seed demo data via sql.js DB ──────
step(3, 'Seeding demo data (sql.js)');
try {
  // Load env so DB path resolves
  const { config } = await import('dotenv');
  config({ path: envPath });

  const { initDb, get, run, all } = await import('./db.js');
  await initDb();

  // Check if demo user exists
  const existing = get('SELECT id FROM users WHERE email=?', ['demo@studyflow.pro']);
  if (existing) {
    ok('Demo data already exists — skipping seed');
  } else {
    const { default: bcrypt } = await import('bcryptjs');
    const { v4: uuid } = await import('uuid');
    const now = new Date();

    // Create demo user with xp/level/streak
    const userId = uuid();
    const hash = await bcrypt.hash('demo1234', 12);
    run(`INSERT INTO users(id,name,email,password,role,subjects,goals,streak,xp,level,last_active)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [
      userId, 'Alex Johnson', 'demo@studyflow.pro', hash, 'Student',
      JSON.stringify(['Mathematics','Computer Science','Physics']),
      JSON.stringify(['Complete all assignments by Friday','Study 2h daily','Ace finals']),
      6, 380, 4,
      new Date(now.getTime() - 86400000).toISOString().slice(0,10), // yesterday = streak active
    ]);

    // Tasks
    const tasks = [
      { title:'Calculus Problem Set 4', subject:'Mathematics', priority:'high', status:'in-progress', deadline:new Date(now.getTime()+2*86400000), estimate:90, tracked:45, tags:JSON.stringify(['homework','calculus']), description:'Complete problems 1–20 from Chapter 8.', subtasks:JSON.stringify([{id:'sub1',title:'Problems 1-7',done:true},{id:'sub2',title:'Problems 8-14',done:true},{id:'sub3',title:'Problems 15-20',done:false}]) },
      { title:'Physics Lab Report — Waves', subject:'Physics', priority:'high', status:'todo', deadline:new Date(now.getTime()+4*86400000), estimate:120, tracked:0, tags:JSON.stringify(['lab','report']), description:'Write up the wave interference experiment.' },
      { title:'CS Project: REST API', subject:'Computer Science', priority:'medium', status:'in-progress', deadline:new Date(now.getTime()+7*86400000), estimate:180, tracked:60, tags:JSON.stringify(['project','nodejs']), subtasks:JSON.stringify([{id:'s1',title:'Design schema',done:true},{id:'s2',title:'Implement endpoints',done:true},{id:'s3',title:'Write tests',done:false},{id:'s4',title:'Deploy',done:false}]) },
      { title:'English Essay — Gothic Literature', subject:'English', priority:'medium', status:'todo', deadline:new Date(now.getTime()+5*86400000), estimate:60, tracked:0, tags:JSON.stringify(['essay','writing']) },
      { title:'Chemistry Flashcards — Organic', subject:'Chemistry', priority:'low', status:'todo', deadline:new Date(now.getTime()+10*86400000), estimate:30, tracked:0, tags:JSON.stringify(['revision','flashcards']) },
      { title:'Mock Exam Practice', subject:'Mathematics', priority:'high', status:'completed', deadline:new Date(now.getTime()-86400000), estimate:120, tracked:120, tags:JSON.stringify(['exam','practice']) },
    ];
    for (const t of tasks) {
      run(`INSERT INTO tasks(id,title,description,subject,priority,status,deadline,estimate,tracked,tags,subtasks,recurrence,assignee,user_id)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        uuid(), t.title, t.description||'', t.subject, t.priority, t.status,
        new Date(t.deadline).toISOString(), t.estimate, t.tracked, t.tags,
        t.subtasks||'[]', 'none', '', userId,
      ]);
    }
    ok(`${tasks.length} tasks seeded`);

    // Note
    run(`INSERT INTO notes(id,content,user_id) VALUES(?,?,?)`, [uuid(), `# Study Notes

## Mathematics
- Integration by parts: ∫u dv = uv − ∫v du
- Trigonometric substitution: use when you see √(a²−x²)

## Physics — Wave Equations
- v = fλ (velocity = frequency × wavelength)
- Standing waves: λ = 2L/n

## CS — REST API Design
- Use nouns not verbs in endpoints
- HTTP status codes: 200, 201, 400, 401, 404, 500

## Chemistry — Organic
- Alkanes: CnH2n+2 (methane, ethane, propane…)
- Functional groups: -OH (alcohol), -COOH (carboxylic acid), -NH2 (amine)
- Reaction types: addition, substitution, elimination, condensation

---
*StudyFlow Pro v2 · Markdown supported · Auto-saved*`, userId]);
    ok('Note seeded');

    // Alarm
    run(`INSERT INTO alarms(id,label,when_time,repeat,active,user_id) VALUES(?,?,?,?,?,?)`, [
      uuid(), 'Evening Study Session',
      new Date(now.getTime()+3600000).toISOString(), 'daily', 1, userId,
    ]);
    ok('Alarm seeded');

    // Flashcards (demo deck)
    const flashcards = [
      { subject:'Mathematics', front:'What is the derivative of sin(x)?', back:'cos(x)' },
      { subject:'Mathematics', front:'What is the integral of 1/x?', back:'ln|x| + C' },
      { subject:'Physics', front:'What is Newton\'s Second Law?', back:'F = ma (Force = mass × acceleration)' },
      { subject:'Physics', front:'What is the formula for kinetic energy?', back:'KE = ½mv²' },
      { subject:'Computer Science', front:'What does REST stand for?', back:'Representational State Transfer' },
      { subject:'Computer Science', front:'What is Big O notation for binary search?', back:'O(log n)' },
      { subject:'Chemistry', front:'What is the general formula for alkanes?', back:'CnH2n+2' },
      { subject:'Chemistry', front:'What is a covalent bond?', back:'A bond formed by sharing electrons between atoms' },
    ];
    for (const fc of flashcards) {
      // Set varying due dates so some are due now (for review demo)
      const daysUntilDue = Math.floor(Math.random() * 4) - 1; // -1 to 2 days
      const dueAt = new Date(now.getTime() + daysUntilDue * 86400000);
      run(`INSERT INTO flashcards(id,user_id,subject,front,back,ease,interval_days,repetitions,due_at) VALUES(?,?,?,?,?,?,?,?,?)`, [
        uuid(), userId, fc.subject, fc.front, fc.back, 2.5, Math.max(daysUntilDue, 1), Math.floor(Math.random()*3), dueAt.toISOString(),
      ]);
    }
    ok(`${flashcards.length} flashcards seeded`);

    // Pomodoro sessions (last 7 days for demo analytics)
    const pomoSubjects = ['Mathematics','Computer Science','Physics','Mathematics','Chemistry','Computer Science','Mathematics'];
    for (let i = 6; i >= 0; i--) {
      const sessionDate = new Date(now.getTime() - i * 86400000);
      const sessionsToday = i === 0 ? 2 : Math.floor(Math.random() * 3) + 1;
      for (let s = 0; s < sessionsToday; s++) {
        run(`INSERT INTO pomodoro_sessions(id,user_id,duration,completed,subject,started_at,ended_at) VALUES(?,?,?,?,?,?,?)`, [
          uuid(), userId, 25, 1, pomoSubjects[i], sessionDate.toISOString(), sessionDate.toISOString(),
        ]);
      }
    }
    ok('Pomodoro session history seeded (7 days)');

    // XP events (to explain the 380 XP already in the user record)
    const xpEvents = [
      { amount:35, reason:'task_completed_high' },
      { amount:15, reason:'task_completed_early' },
      { amount:20, reason:'task_completed_medium' },
      { amount:20, reason:'task_completed_medium' },
      { amount:10, reason:'task_completed_low' },
      { amount:8,  reason:'pomodoro_completed' },
      { amount:8,  reason:'pomodoro_completed' },
      { amount:8,  reason:'pomodoro_completed' },
      { amount:12, reason:'streak_day' },
      { amount:12, reason:'streak_day' },
      { amount:12, reason:'streak_day' },
      { amount:12, reason:'streak_day' },
      { amount:12, reason:'streak_day' },
      { amount:12, reason:'streak_day' },
      { amount:25, reason:'friend_invited' },
      { amount:3,  reason:'flashcard_created' },
      { amount:3,  reason:'flashcard_created' },
      { amount:3,  reason:'flashcard_created' },
      { amount:2,  reason:'flashcard_reviewed' },
      { amount:2,  reason:'flashcard_reviewed' },
      { amount:2,  reason:'flashcard_reviewed' },
      { amount:2,  reason:'flashcard_reviewed' },
      { amount:35, reason:'task_completed_high' },
      { amount:15, reason:'task_completed_early' },
      { amount:20, reason:'task_completed_medium' },
      { amount:10, reason:'task_completed_low' },
    ];
    for (const e of xpEvents) {
      run(`INSERT INTO xp_events(id,user_id,amount,reason,meta) VALUES(?,?,?,?,?)`, [
        uuid(), userId, e.amount, e.reason, '{}',
      ]);
    }
    ok('XP history seeded');

    // Unlock some starter badges for the demo
    const starterBadges = ['first_task','streak_3','pomodoro_10','flashcard_10'];
    for (const badgeId of starterBadges) {
      const badge = get('SELECT id FROM badges WHERE id=?', [badgeId]);
      if (badge) {
        run(`INSERT OR IGNORE INTO user_badges(id,user_id,badge_id) VALUES(?,?,?)`, [uuid(), userId, badgeId]);
      }
    }
    ok('Starter badges unlocked for demo user');

    ok(`\n    Demo user: demo@studyflow.pro / demo1234`);
  }
} catch (e) {
  warn('Seed failed: ' + e.message);
  console.error(e);
}

// ── Done ──────────────────────────────────────
console.log(c.bold(c.green(`
╔══════════════════════════════════════════════╗
║           Setup Complete! 🎉                 ║
╠══════════════════════════════════════════════╣
║                                              ║
║  1. Edit backend/.env (add email creds):     ║
║     → EMAIL_HOST, EMAIL_USER, EMAIL_PASS     ║
║                                              ║
║  2. Start the app:                           ║
║     → cd backend && node start-all.js        ║
║                                              ║
║  3. Open in browser:                         ║
║     → http://localhost:3000                  ║
║                                              ║
║  Demo: demo@studyflow.pro / demo1234         ║
║                                              ║
╚══════════════════════════════════════════════╝
`)));
