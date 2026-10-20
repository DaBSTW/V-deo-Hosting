import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/admin";
import { route } from "@/server/http";
import { listPayouts } from "@/server/monetization/admin";

export const dynamic = "force-dynamic";

const status = z.enum(["PENDING", "APPROVED", "PAID", "REJECTED"]).optional();

/** GET /api/admin/payouts?status= — por defecto, los pendientes de gestionar. */
export const GET = route(async (req) => {
  await requireApiAdmin();
  const s = status.parse(req.nextUrl.searchParams.get("status") ?? undefined);
  return NextResponse.json({ payouts: await listPayouts(s) });
});
