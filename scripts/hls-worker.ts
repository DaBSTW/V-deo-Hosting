/**
 * Worker de post-procesado HLS para R2.  Uso: `npm run worker:hls`
 * Ejecutar como servicio aparte (systemd / contenedor `worker`) en el VPS.
 */
import "./_env";
import { getR2Env } from "#srv/env";
import { prisma } from "#srv/prisma";
import { processNextHlsJob } from "#srv/video-providers/r2-hls-transcoder";

const IDLE_MS = 15_000;
let stopping = false;

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.info(`[hls] ${sig} recibido, terminando tras el trabajo actual…`);
    stopping = true;
  });
}

async function main() {
  // Desactivado por defecto: sin R2_HLS_ENABLED=true no se transcodifica nada (cero CPU).
  if (!getR2Env().R2_HLS_ENABLED) {
    console.info("[hls] R2_HLS_ENABLED no está activado: el worker no tiene nada que hacer y se cierra.");
    await prisma.$disconnect();
    return;
  }
  console.info("[hls] worker iniciado");
  while (!stopping) {
    let worked = false;
    try {
      worked = await processNextHlsJob();
    } catch (err) {
      console.error("[hls] error inesperado:", err);
    }
    if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
  await prisma.$disconnect();
}

void main();
