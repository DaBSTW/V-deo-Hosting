import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { createFolder, listFolders } from "@/server/videos/service";
import { folderNameSchema } from "./schema";

export const dynamic = "force-dynamic";

/** GET /api/folders */
export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json({ folders: await listFolders(user.id) });
});

/** POST /api/folders — `{ name }` */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  const { name } = folderNameSchema.parse(await readJson(req));
  return NextResponse.json({ folder: await createFolder(user.id, name) }, { status: 201 });
});
