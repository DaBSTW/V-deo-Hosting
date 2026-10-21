import { defineEventHandler, getCookie, getRequestURL, sendRedirect, setResponseHeaders } from "h3";
import { SESSION_COOKIE, verifySession } from "#srv/auth/jwt";

/**
 * Cabeceras de seguridad y protección de páginas:
 *  - /embed/* se puede incrustar (frame-ancestors = EMBED_ALLOWED_ORIGINS) y no se indexa.
 *  - Todo lo demás NO se puede incrustar (anti-clickjacking).
 *  - /dashboard requiere sesión; /login y /register redirigen al panel si ya la hay.
 * Las APIs validan la sesión por su cuenta (requireApiUser).
 */
export default defineEventHandler(async (event) => {
  const { pathname, search } = getRequestURL(event);
  const common = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };

  if (pathname.startsWith("/embed/")) {
    const ancestors = (process.env.EMBED_ALLOWED_ORIGINS ?? "*").trim() || "*";
    setResponseHeaders(event, { ...common, "X-Robots-Tag": "noindex", "Content-Security-Policy": `frame-ancestors ${ancestors}` });
    return;
  }
  setResponseHeaders(event, { ...common, "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" });

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (!isDashboard && !isAuthPage) return;

  const session = await verifySession(getCookie(event, SESSION_COOKIE));
  if (isDashboard && !session) {
    return sendRedirect(event, `/login?next=${encodeURIComponent(pathname + search)}`, 302);
  }
  if (isAuthPage && session) return sendRedirect(event, "/dashboard", 302);
});
