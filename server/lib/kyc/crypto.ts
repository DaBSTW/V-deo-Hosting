/**
 * Cifrado autenticado AES-256-GCM para datos de identidad.
 * Formato: [iv 12 bytes][tag 16 bytes][ciphertext]. Sin la clave
 * (KYC_ENCRYPTION_KEY) los archivos y números de documento son ilegibles.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getCoreEnv } from "#srv/env";
import { HttpError } from "../http";

function key(): Buffer {
  const k = getCoreEnv().KYC_ENCRYPTION_KEY;
  if (!k) {
    console.error("[kyc] Falta KYC_ENCRYPTION_KEY: la verificación de identidad está deshabilitada");
    throw new HttpError(503, "kycUnavailable");
  }
  return Buffer.from(k, "base64");
}

export function seal(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function unseal(sealed: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key(), sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

export const sealText = (s: string) => seal(Buffer.from(s, "utf8")).toString("base64");
export const unsealText = (s: string) => unseal(Buffer.from(s, "base64")).toString("utf8");
