# ── Base ──────────────────────────────────────────────────────────────
FROM node:22-slim AS base
# libstdc++ is needed by some native deps (pg, etc.)
RUN apt-get update && apt-get install -y libstdc++6 curl && rm -rf /var/lib/apt/lists/*

# ── Dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && npm run worker"]

# ── Runtime ───────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Standalone server + public assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Full node_modules from build ensuring all Prisma CLI dependencies (effect, c12, etc.) and scripts work.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json

EXPOSE 3100
# Apply migrations, seed the admin, then start the server.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node scripts/seed-admin.mjs && node server.js"]
