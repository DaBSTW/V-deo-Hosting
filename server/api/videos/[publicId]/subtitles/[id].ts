import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, noContent, readJson } from "#srv/http";
import { deleteSubtitle, updateSubtitle } from "#srv/videos/subtitles";

const schema = z
  .object({ label: z.string().trim().min(1).max(60).optional(), isDefault: z.boolean().optional() })
  .refine((v) => v.label !== undefined || v.isDefault !== undefined, "nothingToUpdate");

/** PATCH /api/videos/:publicId/subtitles/:id — renombrar o marcar como predeterminados. */
const PATCH = handler(async (req) => {
  const user = await requireApiUser();
  return json({ subtitle: await updateSubtitle(user.id, req.params.publicId, req.params.id, schema.parse(await readJson(req))) });
});

/** DELETE /api/videos/:publicId/subtitles/:id */
const DELETE = handler(async (req) => {
  const user = await requireApiUser();
  await deleteSubtitle(user.id, req.params.publicId, req.params.id);
  return noContent();
});

export default methods({ PATCH, DELETE });
