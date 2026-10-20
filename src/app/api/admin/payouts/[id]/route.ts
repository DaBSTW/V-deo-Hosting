import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/admin";
import { readJson, route } from "@/server/http";
import { listPayouts, processPayout } from "@/server/monetization/admin";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["approve", "pay", "reject"]),
  reference: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/admin/payouts/:id — aprobar, marcar como pagado o rechazar. */
export const PATCH = route<Ctx>(async (req, ctx) => {
  await requireApiAdmin();
  const { action, reference, note } = schema.parse(await readJson(req));
  await processPayout((await ctx.params).id, action, reference, note);
  return NextResponse.json({ payouts: await listPayouts() });
});
