/**
 * Rate limiter en memoria (ventana fija). Suficiente para un único VPS; si
 * escalas a varias instancias, sustitúyelo por Redis manteniendo la firma.
 */
import type { NextRequest } from "next/server";
import { HttpError } from "./http";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return;
  }
  if (++bucket.count > limit) {
    throw new HttpError(429, "tooManyRequests");
  }
}

/** IP del cliente detrás de Cloudflare / reverse proxy. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
