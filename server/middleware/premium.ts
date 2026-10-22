import { appendResponseHeader, defineEventHandler, getCookie, getRequestHeader, getRequestURL } from "h3";
import { SESSION_COOKIE, verifySession } from "#srv/auth/jwt";
import { prisma } from "#srv/prisma";
import { PREMIUM_COOKIE, REFRESH_BEFORE_SEC, clearPremiumCookieHeader, premiumCookieHeader, readPremiumPass } from "#srv/premium/token";
import { maybeResyncUser } from "#srv/premium/service";

/**
 * Mantiene al día el pase Premium (`dp`) en las navegaciones de páginas.
 * Solo consulta la DB si falta la cookie, es de otro usuario o le queda menos
 * de 2 días: como mucho una consulta al día por usuario con sesión.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== "GET") return;
  const { pathname } = getRequestURL(event);
  if (/^\/(api|media|_nuxt|__nuxt)\b/.test(pathname) || !(getRequestHeader(event, "accept") ?? "").includes("text/html")) return;

  const raw = getCookie(event, PREMIUM_COOKIE);
  const session = await verifySession(getCookie(event, SESSION_COOKIE));
  if (!session) {
    // Sin sesión el pase sigue valiendo hasta caducar (máx. 3 días); solo se
    // borran los de usuarios no Premium, que ya no sirven para nada.
    if (raw && readPremiumPass(raw)?.premium === false) appendResponseHeader(event, "Set-Cookie", clearPremiumCookieHeader());
    return;
  }
  const pass = readPremiumPass(raw);
  if (pass && pass.userId === session.sub && pass.exp - Date.now() / 1000 > REFRESH_BEFORE_SEC) return;

  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, premiumUntil: true } });
  if (!user) return;
  appendResponseHeader(event, "Set-Cookie", premiumCookieHeader(user.id, user.premiumUntil));
  // Si el periodo pagado está por vencer y no llegó el aviso de renovación de
  // PayPal, se comprueba la suscripción en segundo plano.
  maybeResyncUser(user.id, user.premiumUntil);
});
