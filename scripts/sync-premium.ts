/**
 * Resincroniza con PayPal todas las suscripciones Premium vivas (red de
 * seguridad por si se perdió algún webhook). Uso: `npm run premium:sync`,
 * p. ej. con un cron diario en el VPS. Una llamada a PayPal por suscripción.
 */
import "./_env";
import { prisma } from "#srv/prisma";
import { syncAllSubscriptions } from "#srv/premium/service";

async function main() {
  const { total, ok } = await syncAllSubscriptions();
  console.log(`[premium] ${ok}/${total} suscripciones sincronizadas`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
