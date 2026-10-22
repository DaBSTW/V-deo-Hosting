import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods } from "#srv/http";
import { listSettlements } from "#srv/monetization/settlement";

/** GET /api/admin/settlements — mes en curso, meses pendientes de cerrar y cierres hechos. */
const GET = handler(async () => {
  await requireApiAdmin();
  return json(await listSettlements());
});

export default methods({ GET });
