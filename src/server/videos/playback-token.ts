/**
 * Enlaces de reproducción propios y con caducidad.
 *
 * El HTML del embed nunca contiene URLs del proveedor: solo rutas de nuestro
 * dominio (`/media/<publicId>/<asset>?e=<exp>&s=<firma>`). Esa ruta valida la
 * firma y redirige (302) a la URL real recién generada por el adaptador.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCoreEnv } from "@/lib/env";

export type MediaAsset = "source" | "poster";

const payload = (publicId: string, asset: MediaAsset, exp: number) => `${publicId}.${asset}.${exp}`;
const mac = (data: string) =>
  createHmac("sha256", `media:${getCoreEnv().JWT_SECRET}`).update(data).digest("base64url");

/** Caducidad redondeada a la hora: la URL es estable y el navegador la cachea. */
const EXP_BUCKET_SEC = 3600;

export function mediaPath(publicId: string, asset: MediaAsset): string {
  const raw = Math.floor(Date.now() / 1000) + getCoreEnv().PLAYBACK_URL_TTL_SEC;
  const exp = Math.ceil(raw / EXP_BUCKET_SEC) * EXP_BUCKET_SEC;
  return `/media/${publicId}/${asset}?e=${exp}&s=${mac(payload(publicId, asset, exp))}`;
}

export function verifyMediaToken(
  publicId: string,
  asset: MediaAsset,
  exp: string | null,
  sig: string | null,
): boolean {
  const e = Number(exp);
  if (!sig || !Number.isInteger(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(payload(publicId, asset, e)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
