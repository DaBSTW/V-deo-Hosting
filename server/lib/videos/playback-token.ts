/**
 * Enlaces de reproducción / descarga propios y con caducidad.
 *
 * El HTML nunca contiene URLs del proveedor: solo rutas de nuestro dominio
 * (`/media/<publicId>/<asset>?q=<variante>&e=<exp>&s=<firma>`). Esa ruta valida
 * la firma y redirige (302) a la URL real recién generada por el adaptador.
 * La variante (p. ej. la calidad de descarga) va firmada: no se puede alterar.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCoreEnv } from "#srv/env";

export type MediaAsset = "source" | "poster" | "download" | "view";

const payload = (publicId: string, asset: MediaAsset, variant: string, exp: number) =>
  `${publicId}.${asset}.${variant}.${exp}`;
const mac = (data: string) =>
  createHmac("sha256", `media:${getCoreEnv().JWT_SECRET}`).update(data).digest("base64url");

/** Caducidad redondeada a la hora: la URL es estable y el navegador la cachea. */
const EXP_BUCKET_SEC = 3600;

export function mediaPath(publicId: string, asset: MediaAsset, variant = ""): string {
  const raw = Math.floor(Date.now() / 1000) + getCoreEnv().PLAYBACK_URL_TTL_SEC;
  const exp = Math.ceil(raw / EXP_BUCKET_SEC) * EXP_BUCKET_SEC;
  const q = variant ? `q=${encodeURIComponent(variant)}&` : "";
  return `/media/${publicId}/${asset}?${q}e=${exp}&s=${mac(payload(publicId, asset, variant, exp))}`;
}

export function verifyMediaToken(
  publicId: string,
  asset: MediaAsset,
  variant: string,
  exp: string | null,
  sig: string | null,
): boolean {
  const e = Number(exp);
  if (!sig || !Number.isInteger(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(payload(publicId, asset, variant, e)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `f` = gratuito (espera + velocidad limitada), `p` = Premium. */
export type DownloadTier = "f" | "p";
/** Margen para empezar la descarga una vez cumplida la espera. */
const TICKET_TTL_SEC = 15 * 60;

/**
 * Ticket de descarga: enlace firmado que NO vale antes de `notBefore`. La
 * espera de los usuarios gratuitos se impone en el servidor (el contador del
 * botón solo la muestra) y el nivel va firmado: no se puede cambiar `t=f` por `t=p`.
 */
export function downloadTicketPath(publicId: string, optionId: string, notBefore: number, tier: DownloadTier): string {
  const exp = notBefore + TICKET_TTL_SEC;
  const variant = `${optionId}|${notBefore}|${tier}`;
  const q = optionId ? `q=${encodeURIComponent(optionId)}&` : "";
  return `/media/${publicId}/download?${q}nb=${notBefore}&t=${tier}&e=${exp}&s=${mac(payload(publicId, "download", variant, exp))}`;
}

export function verifyDownloadTicket(publicId: string, q: URLSearchParams): { optionId: string; notBefore: number; tier: DownloadTier } | null {
  const optionId = q.get("q") ?? "";
  const nb = Number(q.get("nb"));
  const tier = q.get("t");
  if (!Number.isInteger(nb) || (tier !== "f" && tier !== "p")) return null;
  if (!verifyMediaToken(publicId, "download", `${optionId}|${nb}|${tier}`, q.get("e"), q.get("s"))) return null;
  return { optionId, notBefore: nb, tier };
}
