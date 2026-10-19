/**
 * Servicio de videos: orquesta DB + adaptador de proveedor.
 *
 * Es la única capa que combina ambos mundos. Las rutas HTTP y las páginas
 * llaman a estas funciones; nunca instancian adaptadores directamente.
 */
import { Prisma, type Video } from "@prisma/client";
import { getCoreEnv } from "@/lib/env";
import { newPublicVideoId } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { HttpError } from "../http";
import { getActiveAdapter, getAdapter, getConfiguredAdapters } from "../video-providers/factory";
import type {
  PlaybackSource,
  ProviderMeta,
  ProviderVideoRef,
  ProviderVideoState,
  UploadInstructions,
  WebhookRequest,
} from "../video-providers/types";
import { toPublicVideo, type PublicVideo } from "./dto";
import { mediaPath, type MediaAsset } from "./playback-token";

/** Reutilización de URLs firmadas: una vista = render + source + poster. */
const PLAYBACK_CACHE_MS = 60_000;
const playbackCache = new Map<string, { source: PlaybackSource; until: number }>();

/** Videos en PROCESSING más antiguos que esto se sondean al listar. */
const STATUS_POLL_AFTER_MS = 20_000;
const MAX_POLL_PER_REQUEST = 5;

export const maxUploadBytes = () => getCoreEnv().MAX_UPLOAD_MB * 1024 * 1024;

const refOf = (v: Video): ProviderVideoRef => ({
  providerVideoId: v.providerVideoId,
  providerMeta: (v.providerMeta as ProviderMeta | null) ?? null,
  mimeType: v.mimeType,
});

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------
export interface CreateUploadInput {
  title: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

export async function createUpload(
  userId: string,
  input: CreateUploadInput,
): Promise<{ videoId: string; upload: UploadInstructions }> {
  if (input.sizeBytes > maxUploadBytes()) {
    throw new HttpError(413, `El archivo supera el máximo de ${getCoreEnv().MAX_UPLOAD_MB} MB`);
  }

  // El proveedor ACTIVO solo decide dónde van las subidas nuevas.
  const adapter = getActiveAdapter();
  const publicId = newPublicVideoId();
  const ticket = await adapter.getUploadUrl({ publicId, ...input });

  await prisma.video.create({
    data: {
      publicId,
      userId,
      title: input.title,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      status: "PENDING_UPLOAD",
      provider: adapter.name,
      providerVideoId: ticket.providerVideoId,
      providerMeta: ticket.providerMeta ?? Prisma.JsonNull,
    },
  });

  return { videoId: publicId, upload: ticket.instructions };
}

export async function confirmUpload(
  userId: string,
  publicId: string,
  clientDurationSec?: number | null,
): Promise<PublicVideo> {
  const video = await findOwned(userId, publicId);
  if (video.status !== "PENDING_UPLOAD") return toPublicVideo(video); // idempotente

  const updated = await runConfirm(video, clientDurationSec);
  if (updated.status === "PENDING_UPLOAD") {
    throw new HttpError(409, "La subida aún no ha finalizado");
  }
  return toPublicVideo(updated);
}

async function runConfirm(video: Video, clientDurationSec?: number | null): Promise<Video> {
  const state = await getAdapter(video.provider).confirmUpload(refOf(video), {
    declaredSizeBytes: Number(video.sizeBytes),
    clientDurationSec,
    maxSizeBytes: maxUploadBytes(),
  });
  return applyState(video, state);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const RANK: Record<Video["status"], number> = { PENDING_UPLOAD: 0, PROCESSING: 1, READY: 2, ERROR: 3 };

/** Persiste un estado del proveedor sin permitir retrocesos (webhooks desordenados). */
export async function applyState(video: Video, state: ProviderVideoState): Promise<Video> {
  if (RANK[state.status] < RANK[video.status]) return video;

  const meta = { ...((video.providerMeta as ProviderMeta | null) ?? {}), ...state.providerMeta };
  return prisma.video.update({
    where: { id: video.id },
    data: {
      status: state.status,
      durationSec: state.durationSec ?? video.durationSec,
      sizeBytes: state.sizeBytes ? BigInt(state.sizeBytes) : video.sizeBytes,
      providerMeta: Object.keys(meta).length ? meta : Prisma.JsonNull,
      errorReason: state.status === "ERROR" ? (state.errorReason ?? "unknown") : null,
      postProcessPending: state.postProcess ?? video.postProcessPending,
      readyAt: state.status === "READY" ? (video.readyAt ?? new Date()) : video.readyAt,
    },
  });
}

/**
 * Fallback por sondeo: si un webhook se pierde (o no está configurado),
 * consultamos al proveedor los videos que llevan un rato en PROCESSING.
 */
async function pollStaleVideos(videos: Video[]): Promise<Map<string, Video>> {
  const threshold = Date.now() - STATUS_POLL_AFTER_MS;
  const stale = videos
    .filter((v) => v.status === "PROCESSING" && v.updatedAt.getTime() < threshold)
    .slice(0, MAX_POLL_PER_REQUEST);

  const results = await Promise.allSettled(
    stale.map(async (v) => {
      const state = await getAdapter(v.provider).getStatus(refOf(v));
      // `touch` de updatedAt aunque no cambie, para respetar el intervalo.
      return state.status === v.status
        ? prisma.video.update({ where: { id: v.id }, data: { updatedAt: new Date() } })
        : applyState(v, state);
    }),
  );

  const updated = new Map<string, Video>();
  results.forEach((r) => {
    if (r.status === "fulfilled") updated.set(r.value.id, r.value);
    else console.warn("[videos] sondeo de estado falló:", r.reason);
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------
export async function listVideos(userId: string): Promise<PublicVideo[]> {
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const refreshed = await pollStaleVideos(videos);
  return videos.map((v) => toPublicVideo(refreshed.get(v.id) ?? v));
}

export async function getVideo(userId: string, publicId: string): Promise<PublicVideo> {
  return toPublicVideo(await findOwned(userId, publicId));
}

async function findOwned(userId: string, publicId: string): Promise<Video> {
  const video = await prisma.video.findUnique({ where: { publicId } });
  // 404 también si no es suyo: no revelamos la existencia de videos ajenos.
  if (!video || video.userId !== userId) throw new HttpError(404, "Video no encontrado");
  return video;
}

// ---------------------------------------------------------------------------
// Reproducción (embed)
// ---------------------------------------------------------------------------
export type EmbedLookup =
  | { state: "not_found" }
  | { state: "processing"; title: string }
  | { state: "error"; title: string }
  | { state: "ready"; title: string; durationSec: number | null; source: PlaybackSource };

/**
 * Datos para el reproductor. Las URLs devueltas son rutas PROPIAS firmadas
 * (`/media/...`); la URL real del proveedor solo se resuelve al pedirlas.
 */
export async function getEmbedPlayback(publicId: string): Promise<EmbedLookup> {
  const video = await prisma.video.findUnique({ where: { publicId } });
  if (!video) return { state: "not_found" };
  if (video.status === "ERROR") return { state: "error", title: video.title };
  if (video.status !== "READY") return { state: "processing", title: video.title };

  // El adaptador decide formato (HLS/MP4) y si hay miniatura; nosotros
  // sustituimos sus URLs por rutas propias antes de enviarlas al navegador.
  const real = await providerPlayback(video);
  return {
    state: "ready",
    title: video.title,
    durationSec: video.durationSec,
    source: {
      kind: real.kind,
      mimeType: real.mimeType,
      url: mediaPath(publicId, "source"),
      posterUrl: real.posterUrl ? mediaPath(publicId, "poster") : null,
    },
  };
}

async function providerPlayback(video: Video): Promise<PlaybackSource> {
  // La clave incluye updatedAt: si el video cambia (p. ej. pasa a HLS) se invalida.
  const key = `${video.id}:${video.updatedAt.getTime()}`;
  const hit = playbackCache.get(key);
  if (hit && hit.until > Date.now()) return hit.source;

  const source = await getAdapter(video.provider).getPlaybackUrl(refOf(video));
  if (playbackCache.size > 5_000) playbackCache.clear();
  playbackCache.set(key, { source, until: Date.now() + PLAYBACK_CACHE_MS });
  return source;
}

/** Resuelve la URL real (firmada) del proveedor para la ruta `/media`. */
export async function resolveMediaUrl(publicId: string, asset: MediaAsset): Promise<string | null> {
  const video = await prisma.video.findUnique({ where: { publicId } });
  if (!video || video.status !== "READY") return null;
  const source = await providerPlayback(video);
  return asset === "poster" ? (source.posterUrl ?? null) : source.url;
}

// ---------------------------------------------------------------------------
// Borrado
// ---------------------------------------------------------------------------
export async function deleteVideo(userId: string, publicId: string): Promise<void> {
  const video = await findOwned(userId, publicId);
  // Primero el remoto: si falla, el registro se conserva y el usuario puede reintentar.
  await getAdapter(video.provider).deleteVideo(refOf(video));
  await prisma.video.delete({ where: { id: video.id } });
  for (const key of playbackCache.keys()) if (key.startsWith(`${video.id}:`)) playbackCache.delete(key);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
/**
 * Receptor genérico: se ofrece la petición a cada adaptador configurado; el
 * que la reconoce (por su cabecera de firma) la valida y la normaliza.
 */
export async function handleProviderWebhook(req: WebhookRequest): Promise<{ processed: number }> {
  for (const adapter of getConfiguredAdapters()) {
    const events = await adapter.handleWebhook(req);
    if (events === null) continue;

    let processed = 0;
    for (const event of events) {
      const video = await prisma.video.findUnique({
        where: {
          provider_providerVideoId: { provider: adapter.name, providerVideoId: event.providerVideoId },
        },
      });
      if (!video) continue;

      if (event.type === "upload.completed") {
        if (video.status === "PENDING_UPLOAD") await runConfirm(video);
      } else {
        await applyState(video, event.state);
      }
      processed++;
    }
    return { processed };
  }
  throw new HttpError(400, "Webhook no reconocido");
}
