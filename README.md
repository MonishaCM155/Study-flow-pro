# StudyFlow Pro — Production-Ready Student Productivity App

> A fully functional, real-world upgrade from demo to production.  
> **Real database · Real JWT auth · Real email invitations · Real alarms · Real-time chat**

---

## 🆕 What's New in v2 — Gamification, AI & Mobile

| Feature | Description |
|---|---|
| 🏆 **XP, Levels & Badges** | Earn XP for completing tasks, Pomodoro sessions, streaks, and inviting friends. 17 unlockable badges across bronze/silver/gold tiers. Level titles from "Freshman" to "Legend". |
| 🔥 **Study Streaks** | Daily check-in tracks consecutive study days. Streak badges at 3, 7, and 30 days. |
| 🍅 **Pomodoro Analytics** | Every focus session is logged. View daily focus time, completion rate, and subject breakdown over the last 14 days. |
| 🗂️ **Flashcards + Spaced Repetition** | Create flashcards manually or auto-generate them from your notes (pattern-matches "Term: Definition" and "X is Y"). SM-2-lite algorithm schedules reviews. |
| ✦ **AI Smart Prioritization** | Every task gets a 0-100 "Focus Score" based on urgency, priority, momentum, and progress — no API key required. |
| 📅 **AI Study Planner** | Generates a multi-day study schedule from your pending tasks, respecting deadlines and daily time budgets. |
| 📈 **Performance Prediction** | Per-subject "readiness score" based on completion rate, timing habits, and recent trends — with actionable advice. |
| 🎤 **Voice Input** | Speak a task naturally ("Finish physics lab report by Friday 6pm high priority") — Web Speech API + NLP parsing creates it automatically. |
| 📆 **Google Calendar Sync** | Subscribe to a live `.ics` feed of your tasks in Google Calendar, Apple Calendar, or Outlook. Also supports one-click download. |
| 🏅 **Leaderboard** | See how your XP and streak compare to other students. |
| 📱 **Mobile Responsive** | Collapsible sidebar, bottom-safe layouts, and touch-friendly controls under 900px. |

All new features are powered by **new API routes** (`/api/gamification`, `/api/pomodoro`, `/api/flashcards`, `/api/ai`, `/api/calendar`) and **new SQLite tables** (`xp_events`, `badges`, `user_badges`, `pomodoro_sessions`, `flashcards`) — created automatically via `db.js` migrations on first run. No extra setup required.

---

## ⚡ Quick Start (< 5 minutes)

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Run automated setup (DB migrations + VAPID keys + demo data)
node setup.js

# 3. Configure email (optional but recommended)
#    Edit backend/.env and fill in EMAIL_* fields

# 4. Start everything
node start-all.js

# 5. Open browser
open http://localhost:3000

# Demo login: demo@studyflow.pro / demo1234
```

---

## 🏗 Architecture

```
studyflow-pro/
├── backend/                    ← Node.js + Express API
│   ├── server.js               ← Main server + WebSocket chat
│   ├── routes/
│   │   ├── auth.js             ← Register, login, JWT, profile, push sub
│   │   ├── tasks.js            ← Full CRUD + AI smart schedule + subtasks
│   │   ├── alarms.js           ← Alarms + web push + email + polling endpoint
│   │   ├── friends.js          ← Invite system + real email + friendships
│   │   ├── notes.js            ← Persistent markdown notes (upsert)
│   │   ├── gamification.js     ← XP, levels, badges, streaks, leaderboard
│   │   ├── pomodoro.js         ← Pomodoro session logging + analytics
│   │   ├── flashcards.js       ← Flashcards CRUD + AI generation + SM-2 review
│   │   ├── ai.js                ← Smart priorities, study planner, performance prediction
│   │   └── calendar.js          ← iCal (.ics) export for Google Calendar
│   ├── services/
│   │   ├── email.js            ← Nodemailer: invite + reminder templates
│   │   ├── gamification.js     ← XP/level/badge/streak engine
│   │   └── ai.js                ← Rule-based "AI" engine (no external API key)
│   ├── middleware/
│   │   └── auth.js             ← JWT verification middleware
│   ├── prisma/
│   │   └── schema.prisma       ← All models (User, Task, Alarm, Note, Invite…)
│   ├── setup.js                ← One-time setup: DB + VAPID + seed data
│   ├── start-all.js            ← Boots API (3001) + Frontend (3000)
│   ├── serve-frontend.js       ← Static file server for frontend
│   ├── .env.example            ← All required env vars documented
│   └── package.json
│
├── frontend/
│   ├── index.html              ← Complete SPA (vanilla JS, no framework needed)
│   ├── service-worker.js       ← PWA: push notifications + offline caching
│   └── manifest.json          ← PWA manifest (installable app)
│
└── README.md
```

---

## ✅ What's Real & Production-Ready

| Feature | Demo (before) | Production (now) |
|---------|--------------|-----------------|
| **Auth** | Fake localStorage user | JWT + bcrypt + secure sessions |
| **Tasks** | localStorage only | PostgreSQL/SQLite via Prisma, full CRUD |
| **Email Invites** | `console.log` | Real SMTP via Nodemailer (Gmail/SendGrid/Mailtrap) |
| **Alarms** | `setTimeout` toast | Web Audio API + Browser Notifications + Server polling + Web Push |
| **Group Chat** | Static messages | WebSocket real-time (ws library) + DB persistence |
| **Notes** | localStorage | DB-persisted with 3s auto-save debounce |
| **Push Notifications** | None | VAPID Web Push + Service Worker |
| **PWA** | None | Manifest + Service Worker + offline support |
| **Security** | None | Helmet, CORS, rate limiting, input validation, sanitization |
| **Friends** | Fake list | Real DB friendships + real email invitations with token |
| **Data persistence** | Clears on refresh | DB survives server restarts |

---

## 🔧 Environment Configuration

Copy `backend/.env.example` → `backend/.env` and fill in:

### Database
```env
# SQLite (default — works out of the box):
DATABASE_URL="file:./studyflow.db"

# Switch to PostgreSQL for production:
DATABASE_URL="postgresql://user:pass@host:5432/studyflow"
```

### Email (pick one)

**Gmail (recommended for development):**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your@gmail.com
EMAIL_PASS=xxxx-xxxx-xxxx-xxxx   # 16-char App Password
EMAIL_FROM="StudyFlow Pro <your@gmail.com>"
```
> Get App Password: myaccount.google.com → Security → 2-Step Verification → App passwords

**SendGrid (recommended for production):**
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.your-api-key
```

**Mailtrap (testing — emails captured, never delivered):**
```env
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your-mailtrap-user
EMAIL_PASS=your-mailtrap-pass
```

### Web Push (auto-generated by setup.js)
```env
VAPID_PUBLIC_KEY=<auto-generated>
VAPID_PRIVATE_KEY=<auto-generated>
VAPID_MAILTO=mailto:admin@yourdomain.com
```

---

## 🔔 Alarm System — How It Works

The alarm system has **3 layers** of reliability:

```
Layer 1: Client-side setTimeout
  → Fires when the tab is open
  → Plays Web Audio API sound (synthesized beep)
  → Shows browser Notification API alert

Layer 2: Server polling (every 30 seconds)
  → Frontend polls GET /api/alarms/due
  → Server checks DB for alarms in the past minute
  → Returns due alarms → client fires audio + notification
  → Works even if client was briefly backgrounded

Layer 3: Web Push (when configured)
  → Service Worker receives push from server
  → Shows notification even when browser is closed
  → Requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in .env
  → Server sends push when alarm timer fires (within 24h window)

Bonus: Email backup
  → Server sends email reminder when alarm fires
  → Requires EMAIL_* configured in .env
```

---

## 🔑 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → returns JWT |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/me` | Update profile/password |
| POST | `/api/auth/push-subscribe` | Save push subscription |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List tasks (filterable) |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task (status, subtasks, etc.) |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/smart-schedule` | Auto-prioritize by deadline |

### Alarms
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alarms` | List alarms |
| POST | `/api/alarms` | Create alarm (+ schedules push) |
| PUT | `/api/alarms/:id` | Update alarm |
| DELETE | `/api/alarms/:id` | Delete alarm |
| GET | `/api/alarms/due` | Poll for due alarms (30s interval) |
| POST | `/api/alarms/:id/fire` | Manually fire alarm (for testing) |

### Friends
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/friends` | List friends + sent invites |
| POST | `/api/friends/invite` | Send invite (real email!) |
| POST | `/api/friends/accept/:token` | Accept invite (from email link) |
| DELETE | `/api/friends/invite/:id` | Cancel invite |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | Get user notes |
| PUT | `/api/notes` | Save notes (upsert) |
| GET | `/api/health` | Health check (DB + email + VAPID) |
| GET | `/api/push/vapid-key` | Get VAPID public key |

### Gamification
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gamification/profile` | XP, level, streak, unlocked/locked badges |
| POST | `/api/gamification/checkin` | Register today's streak activity |
| GET | `/api/gamification/leaderboard` | Top 20 users by XP |
| GET | `/api/gamification/badges` | Full badge catalogue with lock status |

### Pomodoro
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pomodoro/sessions` | Log a completed/stopped focus session (awards XP) |
| GET | `/api/pomodoro/analytics?days=14` | Daily totals + subject breakdown |

### Flashcards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flashcards` | List flashcards (`?subject=`, `?due=true`) |
| GET | `/api/flashcards/due-count` | Count of cards due for review |
| POST | `/api/flashcards` | Create one or many cards |
| POST | `/api/flashcards/generate` | Auto-generate cards from pasted text/notes |
| PUT | `/api/flashcards/:id` | Edit a card |
| DELETE | `/api/flashcards/:id` | Delete a card |
| POST | `/api/flashcards/:id/review` | Submit SM-2 review (`quality` 0–5) |

### AI (no external API key required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/priorities` | Tasks ranked by AI Focus Score |
| POST | `/api/ai/study-plan` | Generate a multi-day study schedule (`dailyMinutes`, `days`) |
| GET | `/api/ai/performance` | Per-subject performance prediction + advice |
| POST | `/api/ai/parse-task` | NLP-parse free text into title/subject/priority/deadline |

### Calendar
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calendar/token` | Generate a long-lived `.ics` feed URL |
| GET | `/api/calendar/export` | Download `.ics` of pending tasks (auth required) |
| GET | `/api/calendar/feed.ics?token=` | Public subscription feed (Google/Apple/Outlook) |

### WebSocket
```
ws://localhost:3001/ws/chat

Messages:
  → { type: 'auth', token: '<jwt>', room: 'global' }
  → { type: 'message', text: 'Hello!' }
  ← { type: 'history', messages: [...] }
  ← { type: 'message', message: {...} }
```

---

## 🆕 Voice Input

Click the 🎤 button next to "Quick add task…" and speak naturally:

> "Finish physics lab report by Friday 6pm high priority"

The Web Speech API transcribes your speech, then `/api/ai/parse-task` extracts:
- **Title**: "Finish physics lab report"
- **Subject**: Physics (detected from keywords)
- **Priority**: high (detected from "high priority")
- **Deadline**: next Friday at 6:00 PM

The task is created automatically. Voice input requires Chrome, Edge, or Safari (Web Speech API support).

---

## 🆕 Spaced Repetition Flashcards

1. **Create manually**: Flashcards → "+ New Card" → enter front/back.
2. **Auto-generate**: Paste notes formatted as `Term: Definition` or `X is Y` lines → AI extracts Q&A pairs.
3. **From your notes**: In the Notes tab, click "Generate Flashcards" to convert your current notes.
4. **Review**: Click "▶ Review Due" — cards due today appear one at a time. Rate your recall 😵–🤩 and the SM-2-lite algorithm schedules the next review (1 day → 6 days → exponentially longer for cards you know well).

---

## 🆕 AI Study Planner & Smart Priorities

- **Focus Score** (0–100): every pending task is scored using deadline urgency, priority, momentum (time already tracked), and subtask completion — visible in the AI Planner tab.
- **Study Plan**: set your available daily minutes and plan length (1–30 days), then "Generate Plan" greedily schedules your highest-priority tasks into time blocks, respecting each task's deadline.
- **Performance Prediction**: per-subject "readiness score" combining completion rate, how early you finish tasks, study time vs estimates, and recent trends — with one actionable tip per subject.

All of this runs **entirely server-side with simple statistics — no OpenAI/external API key needed**.

---

## 🆕 Google Calendar / Apple / Outlook Sync

Click **📅 Calendar** in the top bar:
- **Subscribe (live sync)**: copy the feed URL into Google Calendar → Settings → Add Calendar → From URL. New/updated tasks appear automatically (with a 30-minute-before reminder).
- **One-time export**: click "Download .ics file" to import into any calendar app.

---

## 🆕 Gamification — XP, Levels, Streaks & Badges

| Action | XP Awarded |
|---|---|
| Complete a low-priority task | +10 |
| Complete a medium-priority task | +20 |
| Complete a high-priority task | +35 |
| Complete a task before its deadline | +15 bonus |
| Complete a Pomodoro session | +8 |
| Maintain your daily streak | +12 |
| Invite a friend | +25 |
| Create a flashcard | +3 |
| Review a flashcard | +2 |

Level titles run from **Freshman → Sophomore → Junior → Senior → Scholar → Honor Student → Dean's List → Valedictorian → Academic Star → Legend**. 17 badges unlock automatically — view them anytime via the 🏆 Badges button on the dashboard.

---



## 🚀 Production Deployment

### Switch to PostgreSQL
```bash
# 1. Update .env
DATABASE_URL="postgresql://user:pass@host:5432/studyflow"

# 2. Update prisma/schema.prisma
# Change: provider = "sqlite"
# To:     provider = "postgresql"

# 3. Re-run migrations
npx prisma migrate deploy
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourdomain.com
JWT_SECRET=<64-char random hex>
DATABASE_URL=<postgres connection string>
EMAIL_HOST=smtp.sendgrid.net
EMAIL_USER=apikey
EMAIL_PASS=<sendgrid-api-key>
VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
```

### Docker (optional)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/ .
COPY frontend/ ../frontend/
RUN npx prisma generate
EXPOSE 3001 3000
CMD ["node", "start-all.js"]
```

### Process Manager (PM2)
```bash
npm i -g pm2
cd backend
pm2 start start-all.js --name studyflow-pro
pm2 startup
pm2 save
```

---

## 🔒 Security Features

- **JWT authentication** — All API routes protected, tokens expire in 7 days
- **bcrypt password hashing** — 12 salt rounds
- **Helmet.js** — Security headers (XSS, CSRF protection, etc.)
- **express-rate-limit** — 500 req/15min global, 20 req/15min for auth
- **express-validator** — Input validation + sanitization on all routes
- **CORS** — Restricted to `FRONTEND_URL` in production
- **Invite tokens** — UUID v4, single-use, expire with status change
- **SQL injection** — Protected by Prisma ORM parameterized queries

---

## 🧪 Testing Email

```bash
# Check email config via health endpoint
curl http://localhost:3001/api/health

# Expected response:
{
  "status": "ok",
  "database": "connected",
  "email": "configured",      ← or "misconfigured: ..." with error
  "vapid": "configured",
  "uptime": 42.1
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Focus search |
| `⌘N` / `Ctrl+N` | New task modal |
| `⌘,` / `Ctrl+,` | Settings |
| `Escape` | Close modal |
| `Enter` (in chat) | Send message |
| `Enter` (in quick-add) | Add task |

---

## 📱 PWA Installation

1. Open `http://localhost:3000` in Chrome/Edge
2. Click the install icon in the address bar (or browser menu → "Install StudyFlow Pro")
3. The app installs as a native-like desktop/mobile app
4. Alarms will use push notifications even when the app window is closed

---

*Built with: Express · Prisma · SQLite/PostgreSQL · WebSockets · Nodemailer · Web Push · Web Audio API · Service Workers · JWT · bcrypt*
