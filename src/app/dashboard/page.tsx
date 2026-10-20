import { DashboardApp } from "@/components/dashboard/DashboardApp";
import type { FolderFilter } from "@/components/dashboard/types";
import { isAdmin } from "@/server/auth/admin";
import { requirePageUser } from "@/server/auth/session";
import { listFolders, listVideos, maxUploadBytes } from "@/server/videos/service";
import { getDashboardStats } from "@/server/videos/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis videos" };

type Props = { searchParams: Promise<{ folder?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requirePageUser();
  const [videos, folders, stats, { folder }] = await Promise.all([
    listVideos(user.id),
    listFolders(user.id),
    getDashboardStats(user.id),
    searchParams,
  ]);

  // Sin parámetro → Resumen (portada del dashboard).
  const admin = isAdmin(user.email);
  const initialFilter: FolderFilter =
    folder === "monetization"
      ? { kind: "monetization" }
      : folder === "admin" && admin
        ? { kind: "admin" }
        : folder === "all"
      ? { kind: "all" }
      : folder === "none"
        ? { kind: "none" }
        : folder && folders.some((f) => f.id === folder)
          ? { kind: "folder", id: folder }
          : { kind: "overview" };

  return (
    <DashboardApp
      user={{ email: user.email, name: user.name, isAdmin: admin }}
      initialVideos={videos}
      initialFolders={folders}
      initialFilter={initialFilter}
      initialStats={stats}
      maxBytes={maxUploadBytes()}
    />
  );
}
