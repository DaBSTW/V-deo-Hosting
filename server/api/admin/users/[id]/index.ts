import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { setUserMonetization } from "#srv/monetization/admin";

const schema = z.object({ monetizationEnabled: z.boolean() });

/** PATCH /api/admin/users/:id — suspende o reactiva la monetización de una cuenta. */
const PATCH = handler(async (req) => {
  await requireApiAdmin();
  const { monetizationEnabled } = schema.parse(await readJson(req));
  return json({ user: await setUserMonetization(req.params.id, monetizationEnabled) });
});

export default methods({ PATCH });
