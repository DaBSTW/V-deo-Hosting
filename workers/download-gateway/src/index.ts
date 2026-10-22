/**
 * download-gateway — descargas gratuitas a velocidad limitada.
 *
 * El VPS no transfiere el archivo: redirige aquí con un token cifrado
 * (AES-256-GCM) que contiene la URL firmada del proveedor (R2 / Stream), la
 * velocidad máxima en KB/s y una caducidad. Este Worker la descifra, pide el
 * archivo y lo reenvía troceado, esperando entre trozos para no superar la
 * velocidad. Esperar no consume CPU del Worker: solo tiempo de reloj.
 *
 * Los usuarios Premium nunca pasan por aquí (van directos al proveedor).
 * No se aceptan rangos (`Range`): así un gestor de descargas no puede abrir
 * varias conexiones en paralelo para saltarse el límite.
 */
interface Env {
  DOWNLOAD_GATEWAY_SECRET: string;
}

interface Ticket {
  /** URL firmada del proveedor. */
  u: string;
  /** KB/s. */
  k: number;
  /** Caducidad del token (epoch s). */
  x: number;
}

const SLICE = 64 * 1024;
const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

let cachedKey: { raw: string; key: CryptoKey } | null = null;
async function keyOf(secret: string): Promise<CryptoKey> {
  if (cachedKey?.raw === secret) return cachedKey.key;
  const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  cachedKey = { raw: secret, key };
  return key;
}

function fromBase64Url(v: string): Uint8Array {
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((v.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function decrypt(token: string, secret: string): Promise<Ticket | null> {
  try {
    const bytes = fromBase64Url(token);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await keyOf(secret), bytes.slice(12));
    const t = JSON.parse(new TextDecoder().decode(plain)) as Ticket;
    return typeof t.u === "string" && t.u.startsWith("https://") && t.k > 0 && t.x > 0 ? t : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reenvía `body` a `bytesPerSec` como máximo. */
function throttle(body: ReadableStream<Uint8Array>, bytesPerSec: number): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const pump = async () => {
    const reader = body.getReader();
    const writer = writable.getWriter();
    const start = Date.now();
    let sent = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let i = 0; i < value.byteLength; i += SLICE) {
          const part = value.subarray(i, i + SLICE);
          // Si vamos por delante del ritmo permitido, esperamos la diferencia.
          const ahead = (sent / bytesPerSec) * 1000 - (Date.now() - start);
          if (ahead > 0) await sleep(ahead);
          await writer.write(part);
          sent += part.byteLength;
        }
      }
      await writer.close();
    } catch {
      // El cliente cortó la descarga: liberamos el origen.
      await reader.cancel().catch(() => {});
      await writer.abort().catch(() => {});
    }
  };
  void pump();
  return readable;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/d" || (req.method !== "GET" && req.method !== "HEAD")) return text("Not found", 404);
    const ticket = await decrypt(url.searchParams.get("t") ?? "", env.DOWNLOAD_GATEWAY_SECRET);
    if (!ticket) return text("Invalid link", 403);
    if (ticket.x < Date.now() / 1000) return text("This link has expired. Go back to the video page and click Download again.", 410);

    // Sin Range a propósito (ver cabecera del archivo).
    const upstream = await fetch(ticket.u, { method: req.method });
    if (!upstream.ok || (req.method === "GET" && !upstream.body)) return text("Download unavailable", upstream.status === 404 ? 404 : 502);

    const headers = new Headers({ "Cache-Control": "no-store", "Accept-Ranges": "none", "X-Content-Type-Options": "nosniff" });
    for (const h of ["Content-Type", "Content-Length", "Content-Disposition", "Last-Modified", "ETag"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (req.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(throttle(upstream.body!, ticket.k * 1024), { status: 200, headers });
  },
};
