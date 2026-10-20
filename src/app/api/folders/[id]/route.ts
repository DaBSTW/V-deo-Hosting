import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { deleteFolder, renameFolder } from "@/server/videos/service";
import { folderNameSchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/folders/:id — renombrar `{ name }` */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireApiUser();
  const { name } = folderNameSchema.parse(await readJson(req));
  return NextResponse.json({ folder: await renameFolder(user.id, (await ctx.params).id, name) });
});

/** DELETE /api/folders/:id — los videos de la carpeta pasan a "Sin carpeta". */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireApiUser();
  await deleteFolder(user.id, (await ctx.params).id);
  return new NextResponse(null, { status: 204 });
});
