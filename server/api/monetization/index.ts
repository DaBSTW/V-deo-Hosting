import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { getMonetizationOverview, updateMonetizationPrefs } from "#srv/monetization/earnings";

/** GET /api/monetization — saldo, ganancias, tarifas, método de cobro e historial. */
const GET = handler(async () => {
  const user = await requireApiUser();
  return json(await getMonetizationOverview(user.id));
});

const schema = z.object({
  payoutMethod: z.string().max(40).optional(),
  payoutDetails: z.string().max(500).optional(),
});

/**
 * PATCH /api/monetization — método de cobro. La monetización no se puede
 * desactivar desde aquí: está siempre activa (solo el operador la suspende).
 */
const PATCH = handler(async (req) => {
  const user = await requireApiUser();
  await updateMonetizationPrefs(user.id, schema.parse(await readJson(req)));
  return json(await getMonetizationOverview(user.id));
});

export default methods({ GET, PATCH });
