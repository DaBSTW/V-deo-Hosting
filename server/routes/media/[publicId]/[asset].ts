import { isPublicVideoId } from "#shared/lib/ids";
import { localeFromRequest, translatorFor } from "#srv/i18n";
import { handler, methods } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { verifyMediaToken, type MediaAsset } from "#srv/videos/playback-token";
import { prisma } from "#srv/prisma";
import { SESSION_COOKIE, verifySession } from "#srv/auth/jwt";
import { resolveDownload, resolveMediaUrl } from "#srv/videos/service";
import { getMonetizationSettings } from "#srv/monetization/settings";
import { recordPaidView, recordView } from "#srv/videos/stats-buffer";

const ASSETS = new Set<MediaAsset>(["source", "poster", "download"]);

const redirect = (target: string, cacheControl: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": cacheControl, "Referrer-Policy": "no-referrer" },
  });
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * GET /media/:publicId/:asset?q=&e=&s=
 * Pasarela opaca: valida nuestra firma y redirige a la URL de entrega real
 * (generada en ese momento por el adaptador del video). Ni la reproducción
 * ni la descarga pasan por el VPS: solo esta redirección.
 */
const GET = handler(async (req) => {
  const t = translatorFor(localeFromRequest(req));
  {
    const { publicId, asset } = req.params;
    const q = req.nextUrl.searchParams;
    const variant = q.get("q") ?? "";
    if (
      !isPublicVideoId(publicId) ||
      !ASSETS.has(asset as MediaAsset) ||
      !verifyMediaToken(publicId, asset as MediaAsset, variant, q.get("e"), q.get("s"))
    ) {
      return text(t("media.invalidLink"), 403);
    }

    if (asset === "download") {
      rateLimit(`download:${clientIp(req)}`, 30, 60_000);
      const result = await resolveDownload(publicId, variant);
      if (!result || result.status === "unavailable") {
        return text(t("media.downloadUnavailable"), 404);
      }
      if (result.status === "preparing") return preparingPage(t);
      return redirect(result.url, "private, no-store");
    }

    const target = await resolveMediaUrl(publicId, asset as "source" | "poster");
    if (!target) return text(t("media.notFound"), 404);
    // Las miniaturas se repiten mucho en el dashboard: caché corta de la redirección.
    return redirect(target, asset === "poster" ? "private, max-age=300" : "private, no-store");
  }
});

/** El proveedor está generando el MP4: página mínima que reintenta sola. */
function preparingPage(t: ReturnType<typeof translatorFor>) {
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="${t("media.lang")}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15">
<title>${esc(t("media.preparingTitle"))}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16181c;color:#fff;font:600 15px Inter,system-ui,sans-serif;text-align:center}
.s{width:28px;height:28px;margin:0 auto 16px;border:3px solid #34363c;border-top-color:#1bd96a;border-radius:50%;animation:r 1s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}p{color:#96a2b0;font-weight:400;font-size:13px}</style></head>
<body><div><div class="s"></div>${esc(t("media.preparing"))}<p>${esc(t("media.preparingHint"))}</p></div></body></html>`;
  return new Response(html, {
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
const POST = handler(async (req) => {
  const { publicId, asset } = req.params;
  const q = req.nextUrl.searchParams;
  if (asset !== "view" || !isPublicVideoId(publicId) || !verifyMediaToken(publicId, "view", "", q.get("e"), q.get("s"))) {
    return new Response(null, { status: 403 });
  }

  const session = await verifySession(req.cookie(SESSION_COOKIE));
  if (session) {
    const video = await prisma.video.findUnique({ where: { publicId }, select: { userId: true } });
    if (video?.userId === session.sub) return new Response(null, { status: 204 });
  }

  // Los bots no cuentan ni como reproducción ni como vista monetizada.
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return new Response(null, { status: 204 });

  if (q.get("stage") === "q") {
    const settings = await getMonetizationSettings();
    // Sin código de anuncios no hay ingresos que repartir: no se paga la vista.
    if (settings.enabled && settings.monetagPlayerSnippet.trim() && q.get("ad") === "1") {
      // País por Cloudflare (CF-IPCountry); sin Cloudflare delante cae en Nivel 3.
      recordPaidView(publicId, clientIp(req), req.headers.get("cf-ipcountry"), settings.perIpDailyCap);
    }
    return new Response(null, { status: 204 });
  }

  recordView(publicId, clientIp(req));
  return new Response(null, { status: 204 });
});

// Los avisos llegan por sendBeacon (también desde iframes de otros sitios): sin control de Origin.
export default methods({ GET, POST }, { csrf: false });
