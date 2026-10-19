import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { requirePageUser } from "@/server/auth/session";
import { listVideos, maxUploadBytes } from "@/server/videos/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis videos" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const videos = await listVideos(user.id);
  return <DashboardClient initialVideos={videos} maxBytes={maxUploadBytes()} />;
}
