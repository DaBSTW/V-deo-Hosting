import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/server/auth/jwt";

/**
 * Protección de rutas a nivel de borde:
 *  - /embed/* recibe su política de incrustación (frame-ancestors).
 *  - /dashboard/* requiere sesión.
 *  - /login y /register redirigen al dashboard si ya hay sesión.
 * Las APIs validan la sesión por su cuenta (requireApiUser).
 */
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/embed/")) {
    // Qué sitios pueden incrustar el reproductor (separados por espacios).
    const ancestors = (process.env.EMBED_ALLOWED_ORIGINS ?? "*").trim() || "*";
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors}`);
    return res;
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/embed/:path*"],
};
