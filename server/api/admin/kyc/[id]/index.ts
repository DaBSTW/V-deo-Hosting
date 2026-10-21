import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { listVerifications, reviewVerification } from "#srv/kyc/service";

const schema = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(500).optional() });

/** PATCH /api/admin/kyc/:id — aprobar o rechazar (con motivo). */
const PATCH = handler(async (req) => {
  const admin = await requireApiAdmin();
  const { action, note } = schema.parse(await readJson(req));
  await reviewVerification(req.params.id, action, admin.email, note);
  return json({ verifications: await listVerifications("PENDING") });
});

export default methods({ PATCH });
