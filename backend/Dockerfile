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

# install system deps
RUN apk add --no-cache dumb-init wget

# create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 studyflow

# create writable DB directory (IMPORTANT FIX)
RUN mkdir -p /data && chown -R studyflow:nodejs /data

# copy node modules + app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY . .

# entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# switch user AFTER fixing permissions
USER studyflow

# IMPORTANT: move DB here (fix EACCES)
ENV DB_FILE=/data/studyflow.db

EXPOSE 3001
ENV NODE_ENV=production

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]