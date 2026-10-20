import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { getMonetizationOverview, updateMonetizationPrefs } from "@/server/monetization/earnings";

export const dynamic = "force-dynamic";

/** GET /api/monetization — saldo, ganancias, tarifas, método de cobro e historial. */
export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json(await getMonetizationOverview(user.id));
});

const schema = z.object({
  monetizationEnabled: z.boolean().optional(),
  payoutMethod: z.string().max(40).optional(),
  payoutDetails: z.string().max(500).optional(),
});

/** PATCH /api/monetization — activar/desactivar y método de cobro. */
export const PATCH = route(async (req) => {
  const user = await requireApiUser();
  await updateMonetizationPrefs(user.id, schema.parse(await readJson(req)));
  return NextResponse.json(await getMonetizationOverview(user.id));
});
