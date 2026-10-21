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
ENV NUXT_TELEMETRY_DISABLED=1
# Nombre comercial por defecto (también se puede cambiar en tiempo de ejecución con NUXT_PUBLIC_APP_NAME).
ARG NUXT_PUBLIC_APP_NAME=VidHost
ENV NUXT_PUBLIC_APP_NAME=$NUXT_PUBLIC_APP_NAME
RUN npm run build

# ---------- web (Nuxt / Nitro: .output autocontenido) ----------
FROM node:22-bookworm-slim AS web
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY --from=build /app/prisma ./prisma
# CLI de Prisma solo para aplicar migraciones al arrancar.
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# Documentos de identidad cifrados (montar como volumen persistente).
RUN mkdir -p /app/storage/kyc && chown -R node:node /app/storage
USER node
EXPOSE 3000
# Aplica migraciones pendientes y arranca.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node .output/server/index.mjs"]

# ---------- worker (HLS para R2 + tareas) ----------
FROM deps AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY . .
ENV NODE_ENV=production
USER node
CMD ["npx", "tsx", "--tsconfig", "scripts/tsconfig.json", "scripts/hls-worker.ts"]
