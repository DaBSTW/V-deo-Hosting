/**
 * Enlaces al Worker `workers/download-gateway` (Cloudflare), que sirve las
 * descargas gratuitas a velocidad limitada. El VPS no transfiere ni un byte:
 * solo cifra (AES-256-GCM) la URL firmada del proveedor y la velocidad, y
 * redirige al Worker, que la descifra y reenvía el archivo con el límite.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { getGatewayEnv, isGatewayConfigured } from "#srv/env";

const TOKEN_TTL_SEC = 15 * 60;

export function gatewayUrl(upstreamUrl: string, kbps: number): string | null {
  if (!isGatewayConfigured()) return null;
  const env = getGatewayEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(env.DOWNLOAD_GATEWAY_SECRET, "base64"), iv);
  const body = JSON.stringify({ u: upstreamUrl, k: kbps, x: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC });
  // Formato que entiende WebCrypto en el Worker: iv | texto cifrado | etiqueta.
  const token = Buffer.concat([iv, cipher.update(body, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64url");
  return `${env.DOWNLOAD_GATEWAY_URL}/d?t=${token}`;
}
