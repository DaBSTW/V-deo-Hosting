import { isAdmin } from "#srv/auth/admin";
import { getSessionUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { isPremium } from "#srv/premium/service";

/** GET /api/auth/me — usuario de la sesión (o `null`) para la interfaz. */
const GET = handler(async () => {
  const user = await getSessionUser();
  return json(
    {
      user: user
        ? {
            email: user.email,
            name: user.name,
            isAdmin: isAdmin(user.email),
            premium: isPremium(user.premiumUntil),
            premiumUntil: user.premiumUntil?.toISOString() ?? null,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export default methods({ GET });
