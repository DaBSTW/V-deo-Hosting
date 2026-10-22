/**
 * Cliente mínimo de la API REST de PayPal (Subscriptions v1).
 *
 * Solo se usan llamadas de servidor a servidor con las credenciales de la app
 * (client credentials). Nunca se confía en lo que diga el navegador o el cuerpo
 * de un webhook: el estado de una suscripción y sus cobros se leen siempre de
 * la API de PayPal (`getSubscription` + `listTransactions`).
 */
import { getPaypalEnv } from "#srv/env";
import { HttpError } from "../http";

let token: { value: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const env = getPaypalEnv();
  const res = await fetch(`${env.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error("[paypal] token falló:", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, "paymentProviderError");
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, until: Date.now() + Math.max(60, data.expires_in - 120) * 1000 };
  return token.value;
}

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${getPaypalEnv().base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) throw new HttpError(404, "subscriptionNotFound");
  if (!res.ok) {
    console.error(`[paypal] ${method} ${path} → ${res.status}:`, await res.text().catch(() => ""));
    throw new HttpError(502, "paymentProviderError");
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const money = (usd: number) => ({ value: usd.toFixed(2), currency_code: "USD" });

export function createProduct(name: string, homeUrl: string) {
  return call<{ id: string }>("POST", "/v1/catalogs/products", {
    name: `${name} Premium`,
    description: `${name} Premium: sin anuncios y descargas sin espera`,
    type: "SERVICE",
    category: "SOFTWARE",
    home_url: homeUrl.startsWith("https://") ? homeUrl : undefined,
  });
}

export function createPlan(productId: string, name: string, interval: "MONTH" | "YEAR", priceUsd: number) {
  return call<{ id: string }>("POST", "/v1/billing/plans", {
    product_id: productId,
    name,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: interval, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: money(priceUsd) },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1, setup_fee_failure_action: "CANCEL" },
  });
}

interface Link {
  href: string;
  rel: string;
}

export interface PaypalSubscription {
  id: string;
  status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  plan_id: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
  links?: Link[];
}

export async function createSubscription(opts: { planId: string; userId: string; brandName: string; returnUrl: string; cancelUrl: string; requestId: string }) {
  const sub = await call<PaypalSubscription>(
    "POST",
    "/v1/billing/subscriptions",
    {
      plan_id: opts.planId,
      custom_id: opts.userId,
      application_context: {
        brand_name: opts.brandName.slice(0, 127),
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    },
    opts.requestId,
  );
  const approve = sub.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new HttpError(502, "paymentProviderError");
  return { id: sub.id, approveUrl: approve };
}

export const getSubscription = (id: string) => call<PaypalSubscription>("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}`);

export interface PaypalTransaction {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED";
  time: string;
  amount_with_breakdown: {
    gross_amount: { value: string; currency_code: string };
    fee_amount?: { value: string; currency_code: string };
    net_amount?: { value: string; currency_code: string };
  };
}

export async function listTransactions(id: string, from: Date, to: Date) {
  const qs = new URLSearchParams({ start_time: from.toISOString(), end_time: to.toISOString() });
  const res = await call<{ transactions?: PaypalTransaction[] }>("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?${qs}`);
  return res.transactions ?? [];
}

export const cancelSubscription = (id: string, reason: string) =>
  call<void>("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: reason.slice(0, 128) });
