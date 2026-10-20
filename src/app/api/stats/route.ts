import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { getDashboardStats } from "@/server/videos/stats";

export const dynamic = "force-dynamic";

/** GET /api/stats — series diarias de vistas/descargas del usuario (180 días). */
export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json(await getDashboardStats(user.id));
});
