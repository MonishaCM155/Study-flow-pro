// start-all.js — Boots API (3001) + Frontend (3000) in one process
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colour helpers
const c = {
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

function prefixLines(data, prefix) {
  return data.toString().split('\n').filter(Boolean).map(l => `${prefix} ${l}`).join('\n');
}

console.log(c.bold(`
╔══════════════════════════════════════════════╗
║          StudyFlow Pro — Starting Up         ║
╠══════════════════════════════════════════════╣
║  API:      http://localhost:3001             ║
║  Frontend: http://localhost:3000             ║
║  WS Chat:  ws://localhost:3001/ws/chat       ║
╚══════════════════════════════════════════════╝
`));

// Check .env exists
if (!fs.existsSync(path.join(__dirname, '.env'))) {
  console.log(c.yellow('⚠  No .env file found. Copying from .env.example…'));
  fs.copyFileSync(
    path.join(__dirname, '.env.example'),
    path.join(__dirname, '.env')
  );
  console.log(c.yellow('   → Edit backend/.env with your real credentials before production use.\n'));
}

// ── Start API server ──────────────────────────
const api = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env },
});

api.stdout.on('data', d => process.stdout.write(prefixLines(d, c.cyan('[API]')) + '\n'));
api.stderr.on('data', d => process.stderr.write(prefixLines(d, c.red('[API]')) + '\n'));

// ── Start frontend static server ─────────────
const frontend = spawn('node', ['serve-frontend.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env },
});

frontend.stdout.on('data', d => process.stdout.write(prefixLines(d, c.green('[WEB]')) + '\n'));
frontend.stderr.on('data', d => process.stderr.write(prefixLines(d, c.red('[WEB]')) + '\n'));

// ── Print ready message after 2s ─────────────
setTimeout(() => {
  console.log(c.bold(c.green(`
✅  StudyFlow Pro is running!

   Open your browser → http://localhost:3000

   API Health → http://localhost:3001/api/health
   DB Studio  → Run: npm run db:studio
`)));
}, 2000);

// ── Graceful shutdown ─────────────────────────
function shutdown() {
  console.log('\n' + c.yellow('Shutting down…'));
  api.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

api.on('exit', code => {
  if (code !== 0) {
    console.log(c.red(`[API] Process exited with code ${code}`));
  }
});
