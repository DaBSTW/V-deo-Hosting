import { handler, json, methods } from "#srv/http";
import { prisma } from "#srv/prisma";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { syncSubscription } from "#srv/premium/service";

/**
 * POST /api/webhooks/paypal — avisos de PayPal (alta, renovación, cancelación,
 * reembolso…). El cuerpo NO se usa como fuente de verdad: solo se extrae el ID
 * de la suscripción y, si es una nuestra, se vuelve a leer de la API de PayPal.
 * Así un aviso falsificado no puede activar nada (y no hace falta verificar la
 * firma, que costaría otra llamada a PayPal por aviso).
 */
const POST = handler(async (req) => {
  rateLimit(`paypal-hook:${clientIp(req)}`, 120, 60_000);
  const body = (await req.json().catch(() => null)) as { event_type?: string; resource?: Record<string, unknown> } | null;
  const r = body?.resource ?? {};
  const id = [r.billing_agreement_id, (r.supplementary_data as { related_ids?: { subscription_id?: string } })?.related_ids?.subscription_id, String(body?.event_type ?? "").startsWith("BILLING.SUBSCRIPTION.") ? r.id : null].find(
    (v): v is string => typeof v === "string" && /^I-[A-Z0-9]{6,40}$/.test(v),
  );
  if (!id) return json({ ok: true, ignored: true });
  const known = await prisma.subscription.findUnique({ where: { providerSubscriptionId: id }, select: { id: true } });
  if (!known) return json({ ok: true, ignored: true });
  // Se responde enseguida; PayPal reintenta si tarda o falla.
  void syncSubscription(id).catch((err) => console.error("[paypal] webhook sync:", err));
  return json({ ok: true });
});

export default methods({ POST }, { csrf: false });
