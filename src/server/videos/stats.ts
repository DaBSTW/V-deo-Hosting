/**
 * Estadísticas del Resumen del dashboard.
 *
 * Una sola consulta agregada sobre VideoDailyStat (índice por día) para los
 * últimos 180 días: suficiente para comparar 90 días con los 90 anteriores.
 * Totales de videos, almacenamiento, recientes, etc. se derivan en el cliente
 * de la lista de videos que el dashboard ya tiene.
 */
import { prisma } from "@/lib/prisma";
import { flushStats } from "./stats-buffer";
import { storageQuotaBytes } from "./service";

export const STATS_WINDOW_DAYS = 180;

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  views: number;
  downloads: number;
}

export interface DashboardStats {
  days: DailyPoint[];
  /** Vistas/descargas por video en la ventana, para "Más vistos" (id público). */
  perVideo: { id: string; days: { date: string; views: number; downloads: number }[] }[];
  quotaBytes: number | null;
  generatedAt: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  // Que el propio dueño vea las cifras al día (vuelca lo pendiente, si lo hay).
  await flushStats();

  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const from = new Date(today.getTime() - (STATS_WINDOW_DAYS - 1) * 86_400_000);

  const rows = await prisma.$queryRaw<{ publicId: string; day: Date; views: number; downloads: number }[]>`
    SELECT v."publicId", s."day", s."views", s."downloads"
    FROM "VideoDailyStat" s
    JOIN "Video" v ON v."id" = s."videoId"
    WHERE v."userId" = ${userId} AND s."day" >= ${from}::date
    ORDER BY s."day"`;

  // Serie diaria completa (días sin actividad = 0).
  const byDay = new Map<string, DailyPoint>();
  for (let i = 0; i < STATS_WINDOW_DAYS; i++) {
    const date = iso(new Date(from.getTime() + i * 86_400_000));
    byDay.set(date, { date, views: 0, downloads: 0 });
  }
  const perVideo = new Map<string, { date: string; views: number; downloads: number }[]>();
  for (const r of rows) {
    const date = iso(r.day);
    const point = byDay.get(date);
    if (point) {
      point.views += r.views;
      point.downloads += r.downloads;
    }
    const list = perVideo.get(r.publicId) ?? [];
    list.push({ date, views: r.views, downloads: r.downloads });
    perVideo.set(r.publicId, list);
  }

  return {
    days: [...byDay.values()],
    perVideo: [...perVideo].map(([id, days]) => ({ id, days })),
    quotaBytes: storageQuotaBytes(),
    generatedAt: new Date().toISOString(),
  };
}
