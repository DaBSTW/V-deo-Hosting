import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods } from "#srv/http";
import { listAdminUsers } from "#srv/monetization/admin";

/** GET /api/admin/users?q=&suspended=1 — busca cuentas por email o nombre (máx. 25). */
const GET = handler(async (req) => {
  await requireApiAdmin();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  return json({ users: await listAdminUsers(q, req.nextUrl.searchParams.get("suspended") === "1") });
});

export default methods({ GET });
