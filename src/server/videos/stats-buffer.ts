/**
 * Contador de vistas / descargas con escritura por lotes.
 *
 * Cada evento solo incrementa un mapa en memoria (O(1), sin tocar la DB).
 * Cada FLUSH_MS se vuelca todo con DOS consultas SQL, sea cual sea el volumen:
 * un upsert en VideoDailyStat y un UPDATE de los totales en Video. Así un pico
 * de miles de reproducciones no se convierte en miles de escrituras.
 *
 * Los eventos se guardan por `publicId` (lo único que conoce el endpoint, que
 * valida una firma HMAC sin consultar la DB); el JOIN del volcado lo resuelve
 * y descarta videos borrados entretanto.
 *
 * Si escalas a varias instancias, cada una mantiene su propio búfer: los
 * totales siguen siendo correctos (todas suman en la misma tabla).
 */
import { prisma } from "@/lib/prisma";

const FLUSH_MS = 10_000;
const MAX_PENDING = 2_000;
/** Una misma IP solo cuenta una vista por video en esta ventana. */
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

interface Counts {
  views: number;
  downloads: number;
}

interface BufferState {
  pending: Map<string, Counts>;
  seen: Map<string, number>;
  timer?: NodeJS.Timeout;
}

const g = globalThis as unknown as { __statsBuffer?: BufferState };
const state: BufferState = (g.__statsBuffer ??= { pending: new Map(), seen: new Map() });

function schedule(ms: number) {
  if (state.timer) return;
  state.timer = setTimeout(() => void flushStats(), ms);
  state.timer.unref?.();
}

function bump(publicId: string, field: keyof Counts) {
  const c = state.pending.get(publicId) ?? { views: 0, downloads: 0 };
  c[field]++;
  state.pending.set(publicId, c);
  if (state.pending.size >= MAX_PENDING) void flushStats();
  else schedule(FLUSH_MS);
}

/** Registra una vista. Devuelve `false` si era una repetición reciente de la misma IP. */
export function recordView(publicId: string, ip: string): boolean {
  const key = `${ip}|${publicId}`;
  const now = Date.now();
  if ((state.seen.get(key) ?? 0) > now) return false;
  state.seen.set(key, now + VIEW_DEDUPE_MS);
  if (state.seen.size > 100_000) {
    for (const [k, exp] of state.seen) if (exp <= now) state.seen.delete(k);
  }
  bump(publicId, "views");
  return true;
}

export function recordDownload(publicId: string) {
  bump(publicId, "downloads");
}

/** Vuelca el búfer a la base de datos (dos consultas por lote). */
export async function flushStats(): Promise<void> {
  clearTimeout(state.timer);
  state.timer = undefined;
  if (state.pending.size === 0) return;

  const batch = [...state.pending];
  state.pending.clear();
  const ids = batch.map(([id]) => id);
  const views = batch.map(([, c]) => c.views);
  const downloads = batch.map(([, c]) => c.downloads);

  try {
    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO "VideoDailyStat" ("videoId", "day", "views", "downloads")
        SELECT v."id", (now() AT TIME ZONE 'utc')::date, t.views, t.downloads
        FROM unnest(${ids}::text[], ${views}::int[], ${downloads}::int[]) AS t(pid, views, downloads)
        JOIN "Video" v ON v."publicId" = t.pid
        ON CONFLICT ("videoId", "day") DO UPDATE SET
          "views" = "VideoDailyStat"."views" + EXCLUDED."views",
          "downloads" = "VideoDailyStat"."downloads" + EXCLUDED."downloads"`,
      prisma.$executeRaw`
        UPDATE "Video" v SET
          "views" = v."views" + t.views,
          "downloads" = v."downloads" + t.downloads
        FROM unnest(${ids}::text[], ${views}::int[], ${downloads}::int[]) AS t(pid, views, downloads)
        WHERE v."publicId" = t.pid`,
    ]);
  } catch (err) {
    // Reintegramos el lote para no perder los eventos.
    for (const [id, c] of batch) {
      const cur = state.pending.get(id) ?? { views: 0, downloads: 0 };
      state.pending.set(id, { views: cur.views + c.views, downloads: cur.downloads + c.downloads });
    }
    console.error("[stats] volcado falló, se reintentará:", err);
    schedule(FLUSH_MS * 3);
  }
}

// Al apagar el proceso, intentamos volcar el último lote (best effort).
// Registrar un listener anula la salida por defecto de Node: si nadie más
// gestiona la señal, salimos nosotros tras el volcado.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    void flushStats().finally(() => {
      if (process.listenerCount(sig) === 0) process.exit(0);
    });
  });
}
