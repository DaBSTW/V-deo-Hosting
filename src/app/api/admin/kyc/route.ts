import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/admin";
import { route } from "@/server/http";
import { listVerifications } from "@/server/kyc/service";

export const dynamic = "force-dynamic";

/** GET /api/admin/kyc?status=PENDING|APPROVED|REJECTED */
export const GET = route(async (req) => {
  await requireApiAdmin();
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING").parse(req.nextUrl.searchParams.get("status") ?? undefined);
  return NextResponse.json({ verifications: await listVerifications(status) });
});
