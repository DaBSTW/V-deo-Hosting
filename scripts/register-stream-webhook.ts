/**
 * Registra la URL de webhooks de Stream y muestra el secreto de firma.
 * Uso: `npx tsx scripts/register-stream-webhook.ts`
 * Copia el secreto en CF_STREAM_WEBHOOK_SECRET.
 */
import "./_env";
import { getCoreEnv, getStreamEnv } from "@/lib/env";

async function main() {
  const env = getStreamEnv();
  const notificationUrl = `${getCoreEnv().APP_URL}/api/webhooks/cloudflare`;
  const res = await fetch(`${env.CF_API_BASE_URL}/accounts/${env.CF_ACCOUNT_ID}/stream/webhook`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ notificationUrl }),
  });
  const body = (await res.json()) as { success: boolean; result?: { secret?: string }; errors?: unknown };
  if (!body.success) {
    console.error("Error registrando el webhook:", body.errors);
    process.exit(1);
  }
  console.info(`Webhook registrado → ${notificationUrl}`);
  console.info(`CF_STREAM_WEBHOOK_SECRET=${body.result?.secret}`);
}

void main();
