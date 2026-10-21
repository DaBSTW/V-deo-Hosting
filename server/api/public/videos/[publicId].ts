import { isPublicVideoId } from "#shared/lib/ids";
import { getCoreEnv } from "#srv/env";
import { handler, json, methods } from "#srv/http";
import { embedUrlFor } from "#srv/videos/dto";
import { getEmbedPlayback } from "#srv/videos/service";

/**
 * GET /api/public/videos/:publicId — datos de reproducción para /v y /embed.
 * Solo rutas opacas propias (/media/…); nunca URLs ni nombres del proveedor.
 */
const GET = handler(async (req) => {
  const { publicId } = req.params;
  const data = isPublicVideoId(publicId) ? await getEmbedPlayback(publicId) : { state: "not_found" as const };
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  if (data.state === "not_found") return json(data, { status: 404, headers });
  return json(
    {
      ...data,
      watchUrl: `${getCoreEnv().APP_URL}/v/${publicId}`,
      embedUrl: embedUrlFor(publicId),
    },
    { headers },
  );
});

export default methods({ GET });
