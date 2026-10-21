import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods } from "#srv/http";
import { listPayouts } from "#srv/monetization/admin";

const status = z.enum(["PENDING", "APPROVED", "PAID", "REJECTED"]).optional();

/** GET /api/admin/payouts?status= — por defecto, los pendientes de gestionar. */
const GET = handler(async (req) => {
  await requireApiAdmin();
  const s = status.parse(req.nextUrl.searchParams.get("status") ?? undefined);
  return json({ payouts: await listPayouts(s) });
});

export default methods({ GET });
