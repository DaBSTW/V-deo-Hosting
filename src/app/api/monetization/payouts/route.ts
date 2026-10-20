import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getMonetizationOverview, requestPayout } from "@/server/monetization/earnings";

/** POST /api/monetization/payouts — solicita el cobro del saldo disponible. */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  rateLimit(`payout:${user.id}:${clientIp(req)}`, 5, 60 * 60 * 1000);
  await requestPayout(user.id);
  return NextResponse.json(await getMonetizationOverview(user.id), { status: 201 });
});
