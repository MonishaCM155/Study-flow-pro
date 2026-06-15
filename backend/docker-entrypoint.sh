#!/bin/sh
# docker-entrypoint.sh — Run DB migrations then start server
set -e

echo "[Entrypoint] Running Prisma migrations…"
npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss

echo "[Entrypoint] Starting StudyFlow Pro API…"
exec "$@"
