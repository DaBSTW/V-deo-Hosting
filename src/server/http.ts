/**
 * Utilidades HTTP para los Route Handlers.
 *
 * `route()` centraliza: manejo de errores, mensajes genéricos (nunca se filtra
 * un error de infraestructura al cliente), traducción de errores al idioma de
 * la petición y protección CSRF por cabecera Origin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCoreEnv } from "@/lib/env";
import type { AppLocale } from "@/i18n/config";
import type es from "@/i18n/messages/es";
import { localeFromRequest, translatorFor } from "@/i18n/server";
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

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function route<C = unknown>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  const csrf = opts.csrf ?? true;
  return async (req, ctx) => {
    try {
      if (csrf && req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err, localeFromRequest(req));
    }
  };
}

export function errorResponse(err: unknown, locale: AppLocale = "en"): Response {
  const t = translatorFor(locale);
  const msg = (key: string, values?: Record<string, string | number>) =>
    t.has(`errors.${key}` as never) ? t(`errors.${key}` as never, values as never) : t("errors.invalidData");

  if (err instanceof HttpError) {
    return NextResponse.json({ error: msg(err.key, err.values), code: err.key }, { status: err.status });
  }
  if (err instanceof ZodError) {
    // Los mensajes de los esquemas Zod son claves de `errors`.
    return NextResponse.json(
      { error: t("errors.invalidData"), details: err.issues.map((i) => msg(i.message)) },
      { status: 400 },
    );
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }
  if (err instanceof WebhookAuthError) {
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }
  if (err instanceof ProviderError) {
    console.error("[provider]", err.message, err.cause ?? "");
    return NextResponse.json({ error: t("errors.mediaServiceUnavailable") }, { status: 502 });
  }
  console.error("[unhandled]", err);
  return NextResponse.json({ error: t("errors.internal") }, { status: 500 });
}

/** Rechaza peticiones mutantes cuyo Origin no sea el de la propia app. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // clientes no-navegador (curl); la cookie SameSite=Lax ya protege
  const allowed = new Set([new URL(getCoreEnv().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new HttpError(403, "originNotAllowed");
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalidJson");
  }
}
