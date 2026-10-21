/**
 * Utilidades HTTP para los manejadores de la API (Nitro / h3).
 *
 * `route()` centraliza: manejo de errores, mensajes genéricos (nunca se filtra
 * un error de infraestructura al cliente), traducción de errores al idioma de
 * la petición y protección CSRF por cabecera Origin.
 *
 * Los manejadores trabajan con `Request` / `Response` estándar (Web API), así
 * que no dependen del framework.
 */
import { defineEventHandler, getRequestURL, getRouterParams, toWebRequest, type H3Event } from "h3";
import { ZodError } from "zod";
import { getCoreEnv } from "./env";
import type { AppLocale } from "#shared/i18n/config";
import type es from "#shared/i18n/messages/es";
import { localeFromRequest, translatorFor } from "./i18n";
import { ProviderError, WebhookAuthError } from "./video-providers/errors";

/** Clave de `messages.errors` (tipada: una clave inexistente no compila). */
export type ErrorKey = keyof (typeof es)["errors"];

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly key: ErrorKey,
    readonly values?: Record<string, string | number>,
  ) {
    super(key);
    this.name = "HttpError";
  }
}

/** Petición estándar + URL parseada, parámetros de ruta y cookies. */
export interface ApiRequest extends Request {
  readonly nextUrl: URL;
  readonly params: Record<string, string>;
  readonly event: H3Event;
  cookie(name: string): string | undefined;
}

type Handler = (req: ApiRequest) => Promise<Response>;

export function toApiRequest(event: H3Event): ApiRequest {
  const req = toWebRequest(event) as ApiRequest;
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true });
  const cookies = req.headers.get("cookie") ?? "";
  return Object.assign(req, {
    nextUrl: url,
    params: getRouterParams(event, { decode: true }),
    event,
    cookie: (name: string) => {
      const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookies);
      return m ? decodeURIComponent(m[1]) : undefined;
    },
  });
}

export function route(handler: Handler, opts: { csrf?: boolean } = {}) {
  const csrf = opts.csrf ?? true;
  return defineEventHandler(async (event) => {
    const req = toApiRequest(event);
    try {
      if (csrf && req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req);
    } catch (err) {
      return errorResponse(err, localeFromRequest(req));
    }
  });
}

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Una ruta con varios métodos (`GET`, `POST`…), como los Route Handlers:
 * `export default methods({ GET, POST })`. Otros métodos → 405.
 */
export function methods(handlers: Partial<Record<Method, Handler>>, opts: { csrf?: boolean } = {}) {
  return route(async (req) => {
    const handler = handlers[req.method as Method] ?? (req.method === "HEAD" ? handlers.GET : undefined);
    if (!handler) return new Response(null, { status: 405, headers: { Allow: Object.keys(handlers).join(", ") } });
    return handler(req);
  }, opts);
}

/** Identidad tipada para declarar manejadores sueltos. */
export const handler = (fn: Handler): Handler => fn;

export const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
export const noContent = () => new Response(null, { status: 204 });

export function errorResponse(err: unknown, locale: AppLocale = "en"): Response {
  const t = translatorFor(locale);
  const msg = (key: string, values?: Record<string, string | number>) =>
    t.has(`errors.${key}`) ? t.dynamic(`errors.${key}`, values) : t("errors.invalidData");

  if (err instanceof HttpError) {
    return json({ error: msg(err.key, err.values), code: err.key }, { status: err.status });
  }
  if (err instanceof ZodError) {
    // Los mensajes de los esquemas Zod son claves de `errors`.
    return json({ error: t("errors.invalidData"), details: err.issues.map((i) => msg(i.message)) }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return json({ error: t("errors.invalidJson") }, { status: 400 });
  }
  if (err instanceof WebhookAuthError) {
    return json({ error: t("errors.unauthorized") }, { status: 401 });
  }
  if (err instanceof ProviderError) {
    console.error("[provider]", err.message, err.cause ?? "");
    return json({ error: t("errors.mediaServiceUnavailable") }, { status: 502 });
  }
  console.error("[unhandled]", err);
  return json({ error: t("errors.internal") }, { status: 500 });
}

/** Rechaza peticiones mutantes cuyo Origin no sea el de la propia app. */
function assertSameOrigin(req: ApiRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // clientes no-navegador (curl); la cookie SameSite=Lax ya protege
  const allowed = new Set([new URL(getCoreEnv().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new HttpError(403, "originNotAllowed");
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalidJson");
  }
}
