import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { createFolder, listFolders } from "#srv/videos/service";
import { folderNameSchema } from "#srv/videos/folder-schema";

/** GET /api/folders */
const GET = handler(async () => {
  const user = await requireApiUser();
  return json({ folders: await listFolders(user.id) });
});

/** POST /api/folders — `{ name }` */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  const { name } = folderNameSchema.parse(await readJson(req));
  return json({ folder: await createFolder(user.id, name) }, { status: 201 });
});

export default methods({ GET, POST });
