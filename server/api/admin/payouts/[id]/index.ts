import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { listPayouts, processPayout } from "#srv/monetization/admin";

const schema = z.object({
  action: z.enum(["approve", "pay", "reject"]),
  reference: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/admin/payouts/:id — aprobar, marcar como pagado o rechazar. */
const PATCH = handler(async (req) => {
  await requireApiAdmin();
  const { action, reference, note } = schema.parse(await readJson(req));
  await processPayout(req.params.id, action, reference, note);
  return json({ payouts: await listPayouts() });
});

export default methods({ PATCH });
