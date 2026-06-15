# Dockerfile — StudyFlow Pro Backend
# Multi-stage build for lean production image

# ── Stage 1: Dependencies ──────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: Build (Prisma client generation) ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 3: Production runtime ────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init wget

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 studyflow

# Copy built artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY . .

# Run migrations on startup via entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER studyflow

EXPOSE 3001

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
