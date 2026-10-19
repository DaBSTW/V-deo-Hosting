# syntax=docker/dockerfile:1.7
# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- build ----------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Variables públicas (NEXT_PUBLIC_*) se fijan en tiempo de build.
ARG NEXT_PUBLIC_APP_NAME=VidHost
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
RUN npm run build

# ---------- web (Next.js standalone) ----------
FROM node:22-bookworm-slim AS web
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3000
# Aplica migraciones pendientes y arranca.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]

# ---------- worker (HLS para R2 + tareas) ----------
FROM deps AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY . .
ENV NODE_ENV=production
USER node
CMD ["npx", "tsx", "scripts/hls-worker.ts"]
