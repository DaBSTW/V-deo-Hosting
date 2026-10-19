import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { listVideos } from "@/server/videos/service";

export const dynamic = "force-dynamic";

/** GET /api/videos — lista de videos del usuario (solo campos públicos). */
export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json({ videos: await listVideos(user.id) });
});
