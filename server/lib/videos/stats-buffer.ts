/**
 * Contador de vistas / descargas con escritura por lotes.
 *
 * Cada evento solo incrementa un mapa en memoria (O(1), sin tocar la DB).
 * Cada FLUSH_MS se vuelca todo con TRES consultas SQL, sea cual sea el volumen:
 * upsert en VideoDailyStat, upsert de ganancias en EarningDaily y UPDATE de
 * los totales en Video. Así un pico
 * de miles de reproducciones no se convierte en miles de escrituras.
 *
 * Los eventos se guardan por `publicId` (lo único que conoce el endpoint, que
 * valida una firma HMAC sin consultar la DB); el JOIN del volcado lo resuelve
 * y descarta videos borrados entretanto.
 *
 * Si escalas a varias instancias, cada una mantiene su propio búfer: los
 * totales siguen siendo correctos (todas suman en la misma tabla).
 */
import { prisma } from "#srv/prisma";
import { getMonetizationSettings, microsPerView } from "../monetization/settings";
import { TIERS, tierOf, type Tier } from "../monetization/tiers";

const FLUSH_MS = 10_000;
const MAX_PENDING = 2_000;
/** Una misma IP solo cuenta una vista por video en esta ventana. */
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
/** Una vista monetizada por IP y video cada 24 h. */
const PAID_DEDUPE_MS = 24 * 3600 * 1000;

interface Counts {
  views: number;
  downloads: number;
  paid: number;
}

interface BufferState {
  pending: Map<string, Counts>;
  /** Ganancias pendientes por `publicId|tier`. */
  earn: Map<string, number>;
  seen: Map<string, number>;
  /** Vistas monetizadas por IP en el día UTC actual (`día|ip`). */
  ipDaily: Map<string, number>;
  timer?: NodeJS.Timeout;
}

const g = globalThis as unknown as { __statsBuffer?: BufferState };
const state: BufferState = (g.__statsBuffer ??= { pending: new Map(), earn: new Map(), seen: new Map(), ipDaily: new Map() });
state.earn ??= new Map();
state.ipDaily ??= new Map();

function schedule(ms: number) {
  if (state.timer) return;
  state.timer = setTimeout(() => void flushStats(), ms);
  state.timer.unref?.();
}

function bump(publicId: string, field: keyof Counts) {
  const c = state.pending.get(publicId) ?? { views: 0, downloads: 0, paid: 0 };
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

/**
 * Registra una vista MONETIZADA (el reproductor la envía tras el tiempo
 * mínimo de reproducción y sin bloqueador de anuncios). Aplica antifraude
 * barato en memoria: 1 por IP y video cada 24 h y tope diario por IP.
 */
export function recordPaidView(publicId: string, ip: string, country: string | null, perIpDailyCap: number): boolean {
  const now = Date.now();
  const key = `paid|${ip}|${publicId}`;
  if ((state.seen.get(key) ?? 0) > now) return false;

  const dayKey = `${new Date().toISOString().slice(0, 10)}|${ip}`;
  const today = state.ipDaily.get(dayKey) ?? 0;
  if (today >= perIpDailyCap) return false;

  state.seen.set(key, now + PAID_DEDUPE_MS);
  state.ipDaily.set(dayKey, today + 1);
  if (state.ipDaily.size > 200_000) state.ipDaily.clear();

  const earnKey = `${publicId}|${tierOf(country)}`;
  state.earn.set(earnKey, (state.earn.get(earnKey) ?? 0) + 1);
  bump(publicId, "paid");
  return true;
}

/** Vuelca el búfer a la base de datos (dos consultas por lote). */
export async function flushStats(): Promise<void> {
  clearTimeout(state.timer);
  state.timer = undefined;
  if (state.pending.size === 0) return;

  const batch = [...state.pending];
  const earnBatch = [...state.earn];
  state.pending.clear();
  state.earn.clear();
  const ids = batch.map(([id]) => id);
  const views = batch.map(([, c]) => c.views);
  const downloads = batch.map(([, c]) => c.downloads);
  const paid = batch.map(([, c]) => c.paid);

  const ePids = earnBatch.map(([k]) => k.split("|")[0]);
  const eTiers = earnBatch.map(([k]) => k.split("|")[1]);
  const eViews = earnBatch.map(([, n]) => n);

  try {
    // Ganancias: tarifa vigente en el momento del volcado.
    const settings = await getMonetizationSettings();
    const rateOf = Object.fromEntries(TIERS.map((t) => [t, microsPerView(settings, t)])) as Record<Tier, number>;
    const eMicros = earnBatch.map(([k, n]) => n * rateOf[k.split("|")[1] as Tier]);

    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO "VideoDailyStat" ("videoId", "day", "views", "downloads", "paidViews")
        SELECT v."id", (now() AT TIME ZONE 'utc')::date, t.views, t.downloads, t.paid
        FROM unnest(${ids}::text[], ${views}::int[], ${downloads}::int[], ${paid}::int[]) AS t(pid, views, downloads, paid)
        JOIN "Video" v ON v."publicId" = t.pid
        ON CONFLICT ("videoId", "day") DO UPDATE SET
          "views" = "VideoDailyStat"."views" + EXCLUDED."views",
          "downloads" = "VideoDailyStat"."downloads" + EXCLUDED."downloads",
          "paidViews" = "VideoDailyStat"."paidViews" + EXCLUDED."paidViews"`,
      // Solo suman los dueños con la monetización activada.
      prisma.$executeRaw`
        INSERT INTO "EarningDaily" ("userId", "day", "tier", "views", "amountMicros")
        SELECT v."userId", (now() AT TIME ZONE 'utc')::date, t.tier, SUM(t.n)::int, SUM(t.micros)::bigint
        FROM unnest(${ePids}::text[], ${eTiers}::text[], ${eViews}::int[], ${eMicros}::bigint[]) AS t(pid, tier, n, micros)
        JOIN "Video" v ON v."publicId" = t.pid
        JOIN "User" u ON u."id" = v."userId" AND u."monetizationEnabled"
        GROUP BY v."userId", t.tier
        ON CONFLICT ("userId", "day", "tier") DO UPDATE SET
          "views" = "EarningDaily"."views" + EXCLUDED."views",
          "amountMicros" = "EarningDaily"."amountMicros" + EXCLUDED."amountMicros"`,
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
      const cur = state.pending.get(id) ?? { views: 0, downloads: 0, paid: 0 };
      state.pending.set(id, { views: cur.views + c.views, downloads: cur.downloads + c.downloads, paid: cur.paid + c.paid });
    }
    for (const [k, n] of earnBatch) state.earn.set(k, (state.earn.get(k) ?? 0) + n);
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
