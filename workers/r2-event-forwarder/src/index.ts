/**
 * Cloudflare Worker (opcional): consume las "Event Notifications" de R2 desde
 * una Queue y las reenvía firmadas (HMAC-SHA256) al webhook de la plataforma.
 *
 * Permite activar los videos aunque el navegador se cierre justo después de
 * subir (antes de llamar a /api/videos/confirm).
 */
interface Env {
  WEBHOOK_URL: string; // https://tu-dominio.com/api/webhooks/cloudflare
  WEBHOOK_SECRET: string; // = R2_WEBHOOK_SECRET del VPS (wrangler secret put)
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const body = JSON.stringify({ events: batch.messages.map((m) => m.body) });
    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-R2-Event-Signature": await sign(env.WEBHOOK_SECRET, body),
      },
      body,
    });
    // Si falla, la Queue reintenta el lote completo.
    if (!res.ok) batch.retryAll();
  },
};
