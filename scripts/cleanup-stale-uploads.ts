/**
 * Limpia subidas abandonadas (tickets emitidos que nunca se completaron).
 * Uso: `npm run cleanup:stale` — p. ej. con un cron diario en el VPS.
 */
import "./_env";
import type { ProviderMeta } from "#srv/video-providers/types";
import { prisma } from "#srv/prisma";
import { getAdapter } from "#srv/video-providers/factory";

const MAX_AGE_H = Number(process.env.STALE_UPLOAD_HOURS ?? 24);

async function main() {
  const cutoff = new Date(Date.now() - MAX_AGE_H * 3600 * 1000);
  const stale = await prisma.video.findMany({
    where: { status: "PENDING_UPLOAD", createdAt: { lt: cutoff } },
    take: 1000,
  });

  for (const v of stale) {
    try {
      await getAdapter(v.provider).deleteVideo({
        providerVideoId: v.providerVideoId,
        providerMeta: v.providerMeta as ProviderMeta | null,
        mimeType: v.mimeType,
      });
    } catch (err) {
      console.warn(`[cleanup] no se pudo borrar el remoto de ${v.publicId}:`, (err as Error).message);
      continue;
    }
    await prisma.video.delete({ where: { id: v.id } });
    console.info(`[cleanup] eliminado ${v.publicId}`);
  }
  console.info(`[cleanup] ${stale.length} subidas abandonadas revisadas`);
  await prisma.$disconnect();
}

void main();
