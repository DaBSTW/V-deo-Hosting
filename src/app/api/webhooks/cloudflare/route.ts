import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { handleProviderWebhook } from "@/server/videos/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/cloudflare
 * Receptor genérico: cada adaptador reconoce y valida (HMAC) sus propios
 * webhooks. Requiere el cuerpo crudo para verificar la firma.
 */
export const POST = route(
  async (req) => {
    const rawBody = await req.text();
    const result = await handleProviderWebhook({ rawBody, headers: req.headers });
    return NextResponse.json({ ok: true, ...result });
  },
  { csrf: false },
);
