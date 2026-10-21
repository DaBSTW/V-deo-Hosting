import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods } from "#srv/http";
import { listVerifications } from "#srv/kyc/service";

/** GET /api/admin/kyc?status=PENDING|APPROVED|REJECTED */
const GET = handler(async (req) => {
  await requireApiAdmin();
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING").parse(req.nextUrl.searchParams.get("status") ?? undefined);
  return json({ verifications: await listVerifications(status) });
});

export default methods({ GET });
