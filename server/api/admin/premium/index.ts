import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { getPremiumAdminSummary, syncAllSubscriptions, syncPlans } from "#srv/premium/service";
import { getPremiumSettings, premiumSettingsSchema, savePremiumSettings } from "#srv/premium/settings";

const payload = async () => {
  const [settings, summary] = await Promise.all([getPremiumSettings(), getPremiumAdminSummary()]);
  return { settings, summary };
};

/** GET /api/admin/premium — ajustes, suscriptores e ingresos de Premium. */
const GET = handler(async () => {
  await requireApiAdmin();
  return json(await payload());
});

/** PUT /api/admin/premium — guarda los ajustes (los IDs de PayPal no se editan a mano). */
const PUT = handler(async (req) => {
  await requireApiAdmin();
  const current = await getPremiumSettings();
  const next = premiumSettingsSchema.parse({ ...((await readJson(req)) as object), paypalProductId: current.paypalProductId });
  for (const p of ["MONTHLY", "YEARLY"] as const) next.plans[p] = { ...next.plans[p], planId: current.plans[p].planId, planPriceUsd: current.plans[p].planPriceUsd };
  await savePremiumSettings(next);
  return json(await payload());
});

const actionSchema = z.object({ action: z.enum(["syncPlans", "syncAll"]) });

/** POST /api/admin/premium — crear/actualizar planes en PayPal o resincronizar suscripciones. */
const POST = handler(async (req) => {
  await requireApiAdmin();
  const { action } = actionSchema.parse(await readJson(req));
  const result = action === "syncPlans" ? (await syncPlans(), null) : await syncAllSubscriptions();
  return json({ ...(await payload()), result });
});

export default methods({ GET, PUT, POST });
