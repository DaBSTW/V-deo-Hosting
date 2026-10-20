import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth/admin";
import { readJson, route } from "@/server/http";
import { getAdminSummary } from "@/server/monetization/admin";
import { getMonetizationSettings, monetizationSettingsSchema, saveMonetizationSettings } from "@/server/monetization/settings";

export const dynamic = "force-dynamic";

/** GET /api/admin/monetization — ajustes + resumen de la plataforma. */
export const GET = route(async () => {
  await requireApiAdmin();
  const [settings, summary] = await Promise.all([getMonetizationSettings(), getAdminSummary()]);
  return NextResponse.json({ settings, summary });
});

/** PUT /api/admin/monetization — guarda los ajustes (tarifas, reglas, código de Monetag). */
export const PUT = route(async (req) => {
  await requireApiAdmin();
  const settings = await saveMonetizationSettings(monetizationSettingsSchema.parse(await readJson(req)));
  return NextResponse.json({ settings, summary: await getAdminSummary() });
});
