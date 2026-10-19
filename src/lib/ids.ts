import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Cadena aleatoria criptográficamente segura (base62, sin sesgo de módulo). */
export function randomToken(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // 248 = 62 * 4 → descartamos bytes >= 248 para evitar sesgo.
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Identificador público opaco de un video, p. ej. `v_8fK2xQ9mLp3a`. */
export const newPublicVideoId = () => `v_${randomToken(12)}`;

export const PUBLIC_VIDEO_ID_RE = /^v_[0-9A-Za-z]{12}$/;
export const isPublicVideoId = (v: string) => PUBLIC_VIDEO_ID_RE.test(v);
