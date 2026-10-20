import { NextResponse } from "next/server";
import { z } from "zod";
import { isPublicVideoId } from "@/lib/ids";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { MAX_PART_URLS_PER_REQUEST, getUploadPartUrls } from "@/server/videos/service";

const schema = z.object({
  videoId: z.string().refine(isPublicVideoId, "invalidVideoId"),
  parts: z.array(z.number().int().min(1).max(10_000)).min(1).max(MAX_PART_URLS_PER_REQUEST),
});

/**
 * POST /api/videos/upload-parts
 * Subidas grandes (por partes): devuelve `{ urls: { "<n>": url } }` para subir
 * esas partes directo al almacenamiento. El navegador las pide por lotes.
 */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  rateLimit(`upload-parts:${user.id}`, 2_000, 60 * 60 * 1000);
  const { videoId, parts } = schema.parse(await readJson(req));
  return NextResponse.json({ urls: await getUploadPartUrls(user.id, videoId, parts) });
});
