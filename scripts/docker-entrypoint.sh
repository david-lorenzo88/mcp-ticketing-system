#!/bin/sh
# Container entrypoint: bring the schema up to date, then serve.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "→ Applying database migrations…"
  # Prisma takes an advisory lock, so parallel replicas starting at the same
  # time is safe: one migrates, the others wait and then no-op.
  (cd /app/packages/database && npx prisma migrate deploy)
  echo "→ Migrations up to date."
else
  echo "→ RUN_MIGRATIONS=false — skipping migrations."
fi

exec node /app/apps/server/dist/index.js
