import { isPublicVideoId } from "#shared/lib/ids";
import { handler, methods } from "#srv/http";
import { prisma } from "#srv/prisma";

/**
 * GET /subs/:publicId/:id.vtt?v= — archivo WebVTT de unos subtítulos.
 * La URL lleva la versión (`v`), así que se puede cachear un año: tras la
 * primera petición lo sirve la caché de Cloudflare / del navegador.
 */
const GET = handler(async (req) => {
  const { publicId, file } = req.params;
  const id = file.replace(/\.vtt$/, "");
  if (!isPublicVideoId(publicId) || !/^[a-z0-9]{20,32}$/.test(id)) return new Response("Not found", { status: 404 });
  const sub = await prisma.subtitle.findFirst({
    where: { id, video: { publicId, status: "READY" } },
    select: { content: true },
  });
  if (!sub) return new Response("Not found", { status: 404 });
  return new Response(sub.content, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": req.nextUrl.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default methods({ GET });
