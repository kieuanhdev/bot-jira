# syntax=docker/dockerfile:1
# ── Base ──────────────────────────────────────────────────────────────
FROM node:22-slim AS base
# libstdc++: native deps; openssl: Prisma engines; ca-certificates: HTTPS to Jira/Bitbucket
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# ── Dependencies (full, for building) ─────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ── Production dependencies only ──────────────────────────────────────
# prisma (migrate deploy) and tsx (worker) live in `dependencies`, so the
# runtime images no longer need the full devDependency tree.
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ── Build ─────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args are optional; real values come from the runtime env.
ARG DATABASE_URL=postgresql://teamweb:teamweb@db:5432/teamweb
ENV DATABASE_URL=$DATABASE_URL
# Prisma generate needs the schema + config; it does not connect here.
RUN npx prisma generate

# Build Next (standalone output).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Background worker ─────────────────────────────────────────────────
# The worker runs TypeScript through tsx and shares the generated Prisma
# client with the web build. It is a separate deployment target/process.
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec npm run worker"]

# ── Runtime ───────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Standalone server + public assets.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Production node_modules incl. the Prisma CLI and its dependencies.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('net').connect(process.env.PORT||3100,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
# Apply migrations, seed the admin, then start the server.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node scripts/seed-admin.mjs && exec node server.js"]
