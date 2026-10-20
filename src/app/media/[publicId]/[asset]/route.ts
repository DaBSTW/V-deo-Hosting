import { NextResponse, type NextRequest } from "next/server";
import { isPublicVideoId } from "@/lib/ids";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { verifyMediaToken, type MediaAsset } from "@/server/videos/playback-token";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/server/auth/jwt";
import { resolveDownload, resolveMediaUrl } from "@/server/videos/service";
import { getMonetizationSettings } from "@/server/monetization/settings";
import { recordPaidView, recordView } from "@/server/videos/stats-buffer";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ publicId: string; asset: string }> };
const ASSETS = new Set<MediaAsset>(["source", "poster", "download"]);

const redirect = (target: string, cacheControl: string) =>
  NextResponse.redirect(target, {
    status: 302,
    headers: { "Cache-Control": cacheControl, "Referrer-Policy": "no-referrer" },
  });

/**
 * GET /media/:publicId/:asset?q=&e=&s=
 * Pasarela opaca: valida nuestra firma y redirige a la URL de entrega real
 * (generada en ese momento por el adaptador del video). Ni la reproducción
 * ni la descarga pasan por el VPS: solo esta redirección.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { publicId, asset } = await ctx.params;
    const q = req.nextUrl.searchParams;
    const variant = q.get("q") ?? "";
    if (
      !isPublicVideoId(publicId) ||
      !ASSETS.has(asset as MediaAsset) ||
      !verifyMediaToken(publicId, asset as MediaAsset, variant, q.get("e"), q.get("s"))
    ) {
      return new NextResponse("Enlace no válido o caducado", { status: 403 });
    }

    if (asset === "download") {
      rateLimit(`download:${clientIp(req)}`, 30, 60_000);
      const result = await resolveDownload(publicId, variant);
      if (!result || result.status === "unavailable") {
        return new NextResponse("Descarga no disponible", { status: 404 });
      }
      if (result.status === "preparing") return preparingPage();
      return redirect(result.url, "private, no-store");
    }

    const target = await resolveMediaUrl(publicId, asset as "source" | "poster");
    if (!target) return new NextResponse("No encontrado", { status: 404 });
    // Las miniaturas se repiten mucho en el dashboard: caché corta de la redirección.
    return redirect(target, asset === "poster" ? "private, max-age=300" : "private, no-store");
  } catch (err) {
    return errorResponse(err);
  }
}

/** El proveedor está generando el MP4: página mínima que reintenta sola. */
function preparingPage() {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15">
<title>Preparando descarga</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#e4e4e7;font:15px system-ui,sans-serif;text-align:center}
.s{width:28px;height:28px;margin:0 auto 16px;border:3px solid #3f3f46;border-top-color:#4f6ef7;border-radius:50%;animation:r 1s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}p{color:#a1a1aa;font-size:13px}</style></head>
<body><div><div class="s"></div>Estamos preparando tu descarga…<p>La página se actualizará sola en unos segundos.</p></div></body></html>`;
  return new NextResponse(html, {
    status: 202,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|curl|wget|python|httpclient|java\//i;

/**
 * POST /media/:publicId/view?e=&s=[&stage=q&ad=1]
 * Avisos del reproductor (navigator.sendBeacon):
 *  - sin `stage`: empezó a reproducir → cuenta una reproducción.
 *  - `stage=q`: superó el tiempo mínimo → candidata a vista MONETIZADA
 *    (solo si `ad=1`, es decir, sin bloqueador de anuncios).
 * Coste mínimo: firma HMAC + contadores en memoria, sin consultar la DB
 * (salvo con sesión, para no contar al propio dueño).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { publicId, asset } = await ctx.params;
  const q = req.nextUrl.searchParams;
  if (asset !== "view" || !isPublicVideoId(publicId) || !verifyMediaToken(publicId, "view", "", q.get("e"), q.get("s"))) {
    return new NextResponse(null, { status: 403 });
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const video = await prisma.video.findUnique({ where: { publicId }, select: { userId: true } });
    if (video?.userId === session.sub) return new NextResponse(null, { status: 204 });
  }

  // Los bots no cuentan ni como reproducción ni como vista monetizada.
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return new NextResponse(null, { status: 204 });

  if (q.get("stage") === "q") {
    const settings = await getMonetizationSettings();
    if (settings.enabled && q.get("ad") === "1") {
      // País por Cloudflare (CF-IPCountry); sin Cloudflare delante cae en Nivel 3.
      recordPaidView(publicId, clientIp(req), req.headers.get("cf-ipcountry"), settings.perIpDailyCap);
    }
    return new NextResponse(null, { status: 204 });
  }

  recordView(publicId, clientIp(req));
  return new NextResponse(null, { status: 204 });
}
