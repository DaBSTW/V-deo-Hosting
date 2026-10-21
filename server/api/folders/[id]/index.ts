import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, noContent, readJson } from "#srv/http";
import { deleteFolder, renameFolder } from "#srv/videos/service";
import { folderNameSchema } from "#srv/videos/folder-schema";

/** PATCH /api/folders/:id — renombrar `{ name }` */
const PATCH = handler(async (req) => {
  const user = await requireApiUser();
  const { name } = folderNameSchema.parse(await readJson(req));
  return json({ folder: await renameFolder(user.id, req.params.id, name) });
});

/** DELETE /api/folders/:id — los videos de la carpeta pasan a "Sin carpeta". */
const DELETE = handler(async (req) => {
  const user = await requireApiUser();
  await deleteFolder(user.id, req.params.id);
  return noContent();
});

export default methods({ PATCH, DELETE });
