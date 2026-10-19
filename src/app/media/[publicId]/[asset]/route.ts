import { NextResponse, type NextRequest } from "next/server";
import { isPublicVideoId } from "@/lib/ids";
import { errorResponse } from "@/server/http";
import { verifyMediaToken, type MediaAsset } from "@/server/videos/playback-token";
import { resolveMediaUrl } from "@/server/videos/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ publicId: string; asset: string }> };
const ASSETS = new Set<MediaAsset>(["source", "poster"]);

/**
 * GET /media/:publicId/:asset?e=&s=
 * Pasarela opaca: valida nuestra firma y redirige a la URL de entrega real
 * (generada en ese momento por el adaptador activo para ese video).
 * El tráfico de video NO pasa por el VPS: solo esta redirección.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { publicId, asset } = await ctx.params;
    const q = req.nextUrl.searchParams;
    if (
      !isPublicVideoId(publicId) ||
      !ASSETS.has(asset as MediaAsset) ||
      !verifyMediaToken(publicId, asset as MediaAsset, q.get("e"), q.get("s"))
    ) {
      return new NextResponse("Enlace no válido o caducado", { status: 403 });
    }

    const target = await resolveMediaUrl(publicId, asset as MediaAsset);
    if (!target) return new NextResponse("No encontrado", { status: 404 });

    return NextResponse.redirect(target, {
      status: 302,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
