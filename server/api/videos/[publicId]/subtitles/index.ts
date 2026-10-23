import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { LANG_RE, MAX_SUBTITLE_BYTES, addSubtitle, listSubtitles } from "#srv/videos/subtitles";

const schema = z.object({
  lang: z.string().trim().regex(LANG_RE, "invalidLanguage"),
  label: z.string().trim().min(1).max(60),
  /** Texto del archivo .srt o .vtt (se lee en el navegador). */
  content: z.string().min(10).max(MAX_SUBTITLE_BYTES, "subtitlesTooLarge"),
  isDefault: z.boolean().default(false),
});

/** GET /api/videos/:publicId/subtitles — subtítulos del video. */
const GET = handler(async (req) => {
  const user = await requireApiUser();
  return json({ subtitles: await listSubtitles(user.id, req.params.publicId) });
});

/** POST /api/videos/:publicId/subtitles — añade (o reemplaza, si el idioma ya existe) unos subtítulos. */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  const input = schema.parse(await readJson(req));
  return json({ subtitle: await addSubtitle(user.id, req.params.publicId, input) }, { status: 201 });
});

export default methods({ GET, POST });
