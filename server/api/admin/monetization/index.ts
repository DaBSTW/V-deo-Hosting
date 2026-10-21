import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { getAdminSummary } from "#srv/monetization/admin";
import { getMonetizationSettings, monetizationSettingsSchema, saveMonetizationSettings } from "#srv/monetization/settings";

/** GET /api/admin/monetization — ajustes + resumen de la plataforma. */
const GET = handler(async () => {
  await requireApiAdmin();
  const [settings, summary] = await Promise.all([getMonetizationSettings(), getAdminSummary()]);
  return json({ settings, summary });
});

/** PUT /api/admin/monetization — guarda los ajustes (tarifas, reglas, código de Monetag). */
const PUT = handler(async (req) => {
  await requireApiAdmin();
  const settings = await saveMonetizationSettings(monetizationSettingsSchema.parse(await readJson(req)));
  return json({ settings, summary: await getAdminSummary() });
});

export default methods({ GET, PUT });
