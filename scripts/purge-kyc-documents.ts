/**
 * Borra las imágenes de verificaciones de identidad resueltas hace más de
 * KYC_RETENTION_DAYS días (se conserva el registro: nombre, país, decisión).
 * Uso: `npm run kyc:purge` — p. ej. con un cron diario.
 */
import "./_env";
import { prisma } from "#srv/prisma";
import { purgeOldDocuments } from "#srv/kyc/service";

void purgeOldDocuments()
  .then((n) => console.info(`[kyc] ${n} verificaciones purgadas`))
  .finally(() => prisma.$disconnect());
