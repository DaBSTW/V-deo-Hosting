/**
 * Utilidades HTTP para los Route Handlers.
 *
 * `route()` centraliza: manejo de errores, mensajes genéricos (nunca se filtra
 * un error de infraestructura al cliente) y protección CSRF por cabecera Origin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCoreEnv } from "@/lib/env";
import { ProviderError, WebhookAuthError } from "./video-providers/errors";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
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
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos", details: err.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (err instanceof WebhookAuthError) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (err instanceof ProviderError) {
    console.error("[provider]", err.message, err.cause ?? "");
    return NextResponse.json(
      { error: "El servicio de medios no está disponible. Inténtalo de nuevo en unos minutos." },
      { status: 502 },
    );
  }
  console.error("[unhandled]", err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}

/** Rechaza peticiones mutantes cuyo Origin no sea el de la propia app. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // clientes no-navegador (curl); la cookie SameSite=Lax ya protege
  const allowed = new Set([new URL(getCoreEnv().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new HttpError(403, "Origen no permitido");
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}
