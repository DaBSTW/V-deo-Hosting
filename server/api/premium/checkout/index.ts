import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { startCheckout } from "#srv/premium/service";
import { PREMIUM_PLANS } from "#srv/premium/settings";

const schema = z.object({ plan: z.enum(PREMIUM_PLANS) });

/** POST /api/premium/checkout — crea la suscripción en PayPal y devuelve el enlace de pago. */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  rateLimit(`checkout:${user.id}`, 10, 10 * 60_000);
  rateLimit(`checkout:${clientIp(req)}`, 20, 10 * 60_000);
  const { plan } = schema.parse(await readJson(req));
  return json(await startCheckout(user.id, plan));
});

export default methods({ POST });
