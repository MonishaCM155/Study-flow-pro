#!/bin/bash
# ═══════════════════════════════════════════════
# StudyFlow Pro — Full Stack Setup Script
# ═══════════════════════════════════════════════

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║        StudyFlow Pro — Setup Script          ║"
echo "║   Express · Prisma · SQLite · JWT · Email    ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Prerequisites check ────────────────────────
echo -e "${YELLOW}Checking prerequisites…${RESET}"
command -v node >/dev/null 2>&1 || { echo -e "${RED}✗ Node.js required (>= 18). Install from nodejs.org${RESET}"; exit 1; }
NODE_VER=$(node --version | cut -c2- | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then echo -e "${RED}✗ Node.js 18+ required (found v${NODE_VER})${RESET}"; exit 1; fi
echo -e "${GREEN}✓ Node.js $(node --version)${RESET}"

command -v npm >/dev/null 2>&1 || { echo -e "${RED}✗ npm required${RESET}"; exit 1; }
echo -e "${GREEN}✓ npm $(npm --version)${RESET}"

# ── Backend setup ──────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[1/5] Installing backend dependencies…${RESET}"
cd backend
npm install

# ── .env file ─────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[2/5] Setting up environment…${RESET}"
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Generate a random JWT secret
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/your-super-secret-jwt-key-change-this-in-production-please/${JWT_SECRET}/" .env
  else
    sed -i "s/your-super-secret-jwt-key-change-this-in-production-please/${JWT_SECRET}/" .env
  fi
  echo -e "${GREEN}✓ Created .env with random JWT secret${RESET}"
  echo -e "${YELLOW}  ⚠ Edit backend/.env to configure your email (SMTP) settings${RESET}"
else
  echo -e "${GREEN}✓ .env already exists${RESET}"
fi

# ── Generate VAPID keys ────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[3/5] Generating VAPID keys for push notifications…${RESET}"
if grep -q "your-vapid-public-key" .env 2>/dev/null; then
  VAPID_OUTPUT=$(node -e "const webpush=require('web-push');const keys=webpush.generateVAPIDKeys();console.log(keys.publicKey+'|'+keys.privateKey)" 2>/dev/null || echo "SKIP")
  if [ "$VAPID_OUTPUT" != "SKIP" ]; then
    PUB_KEY=$(echo "$VAPID_OUTPUT" | cut -d'|' -f1)
    PRIV_KEY=$(echo "$VAPID_OUTPUT" | cut -d'|' -f2)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|your-vapid-public-key|${PUB_KEY}|" .env
      sed -i '' "s|your-vapid-private-key|${PRIV_KEY}|" .env
    else
      sed -i "s|your-vapid-public-key|${PUB_KEY}|" .env
      sed -i "s|your-vapid-private-key|${PRIV_KEY}|" .env
    fi
    echo -e "${GREEN}✓ VAPID keys generated and saved to .env${RESET}"
  else
    echo -e "${YELLOW}  ⚠ web-push not yet installed, VAPID keys will be blank — run setup again after npm install${RESET}"
  fi
else
  echo -e "${GREEN}✓ VAPID keys already configured${RESET}"
fi

# ── Database setup ─────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[4/5] Setting up database (SQLite via Prisma)…${RESET}"
npx prisma generate
npx prisma migrate dev --name init --skip-seed 2>/dev/null || npx prisma db push
echo -e "${GREEN}✓ Database ready at backend/studyflow.db${RESET}"

cd ..

# ── Done ───────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║           Setup Complete! 🎉                 ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  To start the backend server:                ║"
echo "║    cd backend && npm start                   ║"
echo "║                                              ║"
echo "║  To serve the frontend:                      ║"
echo "║    cd frontend && npx serve .                ║"
echo "║    (or open index.html directly in browser)  ║"
echo "║                                              ║"
echo "║  API health check:                           ║"
echo "║    http://localhost:3001/api/health          ║"
echo "║                                              ║"
echo "║  ⚠ Configure email in backend/.env for      ║"
echo "║    real invite emails to work                ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

[5/5] echo -e "${CYAN}Tip: Run ${BOLD}cd backend && npm start${RESET}${CYAN} to launch the API server${RESET}"
