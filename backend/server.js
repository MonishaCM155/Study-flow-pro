// server.js — StudyFlow Pro Production Backend (sql.js)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

import { initDb, get, all, run } from './db.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import alarmRoutes, { rescheduleAllAlarms } from './routes/alarms.js';
import friendRoutes from './routes/friends.js';
import notesRoutes from './routes/notes.js';
import gamificationRoutes from './routes/gamification.js';
import pomodoroRoutes from './routes/pomodoro.js';
import flashcardRoutes from './routes/flashcards.js';
import aiRoutes from './routes/ai.js';
import calendarRoutes from './routes/calendar.js';
import { verifyEmailConfig } from './services/email.js';

await initDb();

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy:false, crossOriginEmbedderPolicy:false }));
const envAllowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(url => url.trim()).filter(Boolean);
const allowedOrigins = Array.from(new Set([
  'https://study-flow-pro-1.onrender.com',
  'https://deft-stardust-9e7614.netlify.app',
  ...envAllowedOrigins
]));
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn('[CORS] blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials:true,
  methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders:['Content-Type','Authorization'],
  optionsSuccessStatus:204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:true }));
app.use(rateLimit({ windowMs:15*60*1000, max:500, standardHeaders:true, legacyHeaders:false }));
const authLimiter = rateLimit({ windowMs:15*60*1000, max:20 });

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/pomodoro', pomodoroRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calendar', calendarRoutes);

app.get('/api/health', async (req,res) => {
  const emailStatus = await verifyEmailConfig();
  res.json({ status:'ok', database:'connected (sql.js/SQLite)',
    email:emailStatus.ok?'configured':`misconfigured: ${emailStatus.error}`,
    vapid:process.env.VAPID_PUBLIC_KEY?'configured':'not configured',
    uptime:process.uptime(), timestamp:new Date().toISOString() });
});
app.get('/api/push/vapid-key', (req,res) => res.json({ key:process.env.VAPID_PUBLIC_KEY||null }));
app.use((req,res) => res.status(404).json({ error:'Not found' }));
app.use((err,req,res,next) => res.status(err.status||500).json({ error:err.message||'Internal server error' }));

// WebSocket chat
const wss = new WebSocketServer({ server, path:'/ws/chat' });
wss.on('connection', ws => {
  let userId=null, room='global';
  ws.on('message', async raw => {
    try {
      const msg=JSON.parse(raw.toString());
      if (msg.type==='auth') {
        const decoded=jwt.verify(msg.token,process.env.JWT_SECRET);
        userId=decoded.userId; room=msg.room||'global';
        const history=all('SELECT cm.*,u.name AS user_name FROM chat_messages cm JOIN users u ON u.id=cm.user_id WHERE cm.room=? ORDER BY cm.created_at ASC LIMIT 50',[room]);
        ws.send(JSON.stringify({ type:'history', messages:history.map(m=>({id:m.id,text:m.text,userId:m.user_id,userName:m.user_name,room:m.room,createdAt:m.created_at})) }));
        return;
      }
      if (msg.type==='message'&&userId) {
        const text=String(msg.text||'').trim().slice(0,1000);
        if (!text) return;
        const id=uuid();
        run('INSERT INTO chat_messages(id,text,user_id,room) VALUES(?,?,?,?)',[id,text,userId,room]);
        const user=get('SELECT name FROM users WHERE id=?',[userId]);
        const payload=JSON.stringify({ type:'message', message:{id,text,userId,userName:user?.name||'Unknown',room,createdAt:new Date().toISOString()} });
        wss.clients.forEach(c=>{ if(c.readyState===1) c.send(payload); });
      }
      if (msg.type==='ping') ws.send(JSON.stringify({ type:'pong' }));
    } catch(e) { try{ws.send(JSON.stringify({type:'error',message:'Invalid'}));}catch{} }
  });
  ws.on('error', e => console.warn('[WS]',e.message));
});

const PORT=parseInt(process.env.PORT||'3001');
server.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════╗
║       StudyFlow Pro — Backend API        ║
╠══════════════════════════════════════════╣
║  HTTP:   http://localhost:${PORT}           ║
║  WS:     ws://localhost:${PORT}/ws/chat     ║
║  Health: http://localhost:${PORT}/api/health║
╚══════════════════════════════════════════╝`);
  const emailStatus=await verifyEmailConfig();
  console.log(emailStatus.ok?'✅ Email: connected':`⚠️  Email: ${emailStatus.error}\n   → Edit backend/.env`);
  await rescheduleAllAlarms();
  console.log('✅ Server ready\n');
});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
