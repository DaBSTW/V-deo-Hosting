/**
 * Pase Premium firmado en cookie (`dp`).
 *
 * Saber si un espectador es Premium en cada reproducción, aviso del reproductor
 * o descarga no puede costar una consulta a la DB: la cookie lleva el ID del
 * usuario y una caducidad firmados con HMAC. Caduca como mucho a los 3 días
 * (o al fin del periodo pagado, si llega antes) y el middleware `premium` la
 * renueva desde la DB una vez al día, así un reembolso o una baja se reflejan
 * pronto sin consultar nada en el resto de peticiones.
 *
 * Los usuarios con sesión que NO son Premium también reciben la cookie (con la
 * marca `0`), para que el middleware no tenga que consultar la DB en cada
 * página para saber que siguen sin serlo.
 *
 * Es `SameSite=None` (en HTTPS) para que el reproductor incrustado en otros
 * sitios también la reciba; si el navegador bloquea cookies de terceros, el
 * embed simplemente se comporta como para un usuario gratuito.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { serialize } from "cookie-es";

export const PREMIUM_COOKIE = "dp";
const MAX_TTL_SEC = 3 * 24 * 3600;
/** Se renueva cuando le queda menos que esto. */
export const REFRESH_BEFORE_SEC = 2 * 24 * 3600;

const mac = (data: string) => createHmac("sha256", `premium:${process.env.JWT_SECRET}`).update(data).digest("base64url");

export interface PremiumPass {
  userId: string;
  /** Caducidad de la cookie (epoch s), no del periodo pagado. */
  exp: number;
  premium: boolean;
}

/** Lee la cookie firmada (Premium o no). `null` si falta, caducó o está alterada. */
export function readPremiumPass(raw: string | undefined | null): PremiumPass | null {
  if (!raw) return null;
  const [userId, expStr, flag, sig] = raw.split(".");
  const exp = Number(expStr);
  if (!userId || !sig || (flag !== "0" && flag !== "1") || !Number.isInteger(exp) || exp < Date.now() / 1000) return null;
  const expected = Buffer.from(mac(`${userId}.${exp}.${flag}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId, exp, premium: flag === "1" };
}

/** Pase de un usuario Premium vigente (o `null`). */
export function verifyPremiumPass(raw: string | undefined | null): PremiumPass | null {
  const pass = readPremiumPass(raw);
  return pass?.premium ? pass : null;
}

const secure = () => (process.env.APP_URL ?? "").startsWith("https://");

const cookieOpts = () => ({ path: "/", httpOnly: true, secure: secure(), sameSite: secure() ? ("none" as const) : ("lax" as const) });

/** Cabecera `Set-Cookie` del pase de un usuario con sesión (Premium o no). */
export function premiumCookieHeader(userId: string, premiumUntil: Date | null | undefined): string {
  const now = Math.floor(Date.now() / 1000);
  const until = premiumUntil ? Math.floor(premiumUntil.getTime() / 1000) : 0;
  const premium = until > now;
  const exp = premium ? Math.min(until, now + MAX_TTL_SEC) : now + MAX_TTL_SEC;
  const flag = premium ? "1" : "0";
  return serialize(PREMIUM_COOKIE, `${userId}.${exp}.${flag}.${mac(`${userId}.${exp}.${flag}`)}`, { ...cookieOpts(), maxAge: exp - now });
}

export const clearPremiumCookieHeader = () => serialize(PREMIUM_COOKIE, "", { ...cookieOpts(), maxAge: 0 });

/** Pase Premium válido en la cabecera Cookie de una petición. */
export function premiumFromCookieHeader(cookieHeader: string | null | undefined): PremiumPass | null {
  const m = new RegExp(`(?:^|;\\s*)${PREMIUM_COOKIE}=([^;]*)`).exec(cookieHeader ?? "");
  return verifyPremiumPass(m ? decodeURIComponent(m[1]) : null);
}
