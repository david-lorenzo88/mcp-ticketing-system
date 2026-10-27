# ---------------------------------------------------------------------------
# Stage 1 — install every dependency and build all three workspaces.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy only manifests first so `npm ci` is cached until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/database/package.json ./packages/database/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY . .

# `prisma generate` reads the datasource URL from prisma.config.ts but never
# connects, so a placeholder is enough to build. The real URL is injected at
# runtime by Azure.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — production dependencies only.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/database/package.json ./packages/database/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 3 — runtime image.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

RUN apk add --no-cache tini

# The whole production dependency tree in one instruction: the hoisted root
# node_modules, the package manifests, and any nested workspace node_modules
# npm chose not to hoist. Which workspaces get a nested directory depends on
# version resolution and is not stable, so naming them individually breaks the
# build as soon as npm hoists differently — the workspace symlinks in
# node_modules/@baltic are relative, and resolve once the manifests are here.
COPY --from=prod-deps /app ./

COPY packages/database/prisma.config.ts ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY --from=build /app/packages/database/dist ./packages/database/dist

COPY --from=build /app/apps/server/dist ./apps/server/dist

# The server serves the SPA from ../public relative to its own dist directory.
COPY --from=build /app/apps/web/dist ./apps/server/public

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app

USER node

EXPOSE 8080

# tini reaps zombies and forwards SIGTERM, which Container Apps sends on scale-in.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
