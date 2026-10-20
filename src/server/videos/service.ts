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
  DownloadResult,
  PlaybackSource,
  ProviderMeta,
  ProviderVideoRef,
  ProviderVideoState,
  ThumbnailUploadInstructions,
  UploadInstructions,
  WebhookRequest,
} from "../video-providers/types";
import { toPublicVideo, type PublicVideo } from "./dto";
import { mediaPath } from "./playback-token";
import { recordDownload } from "./stats-buffer";
import { getMonetizationSettings } from "../monetization/settings";

/** Reutilización de URLs firmadas: una vista = render + source + poster. */
const PLAYBACK_CACHE_MS = 60_000;
const playbackCache = new Map<string, { source: PlaybackSource; until: number }>();

/** Videos en PROCESSING más antiguos que esto se sondean al listar. */
const STATUS_POLL_AFTER_MS = 20_000;
const MAX_POLL_PER_REQUEST = 5;

export const maxUploadBytes = () => getCoreEnv().MAX_UPLOAD_MB * 1024 * 1024;

/** "20 GB" / "500 MB" para los mensajes de error. */
const maxUploadLabel = () => {
  const mb = getCoreEnv().MAX_UPLOAD_MB;
  return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`;
};

/** Partes que el navegador puede pedir por llamada (subida multipart). */
export const MAX_PART_URLS_PER_REQUEST = 50;

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
  folderId?: string | null;
}

export interface UploadTicketResponse {
  videoId: string;
  upload: UploadInstructions;
  /** Presente solo si el proveedor necesita que el navegador aporte la miniatura. */
  thumbnailUpload?: ThumbnailUploadInstructions;
}

export async function createUpload(
  userId: string,
  { folderId, ...input }: CreateUploadInput,
): Promise<UploadTicketResponse> {
  if (input.sizeBytes > maxUploadBytes()) {
    throw new HttpError(413, "fileTooLarge", { max: maxUploadLabel() });
  }
  if (folderId) await findOwnedFolder(userId, folderId);
  await assertQuota(userId, input.sizeBytes);

  // El proveedor ACTIVO solo decide dónde van las subidas nuevas.
  const adapter = getActiveAdapter();
  const publicId = newPublicVideoId();
  const ticket = await adapter.getUploadUrl({ publicId, ...input });

  await prisma.video.create({
    data: {
      publicId,
      userId,
      folderId: folderId ?? null,
      title: input.title,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      status: "PENDING_UPLOAD",
      provider: adapter.name,
      providerVideoId: ticket.providerVideoId,
      providerMeta: ticket.providerMeta ?? Prisma.JsonNull,
    },
  });

  return { videoId: publicId, upload: ticket.instructions, thumbnailUpload: ticket.thumbnail };
}

/**
 * URLs firmadas para las partes de una subida multipart en curso. Se piden por
 * lotes mientras se sube, así no caducan aunque el archivo tarde horas.
 */
export async function getUploadPartUrls(
  userId: string,
  publicId: string,
  partNumbers: number[],
): Promise<Record<number, string>> {
  const video = await findOwned(userId, publicId);
  const meta = (video.providerMeta as ProviderMeta | null) ?? {};
  const partSize = Number(meta.partSize) || 0;
  const adapter = getAdapter(video.provider);
  if (video.status !== "PENDING_UPLOAD" || !meta.uploadId || !partSize || !adapter.getUploadPartUrls) {
    throw new HttpError(409, "uploadNotFinished");
  }
  const partCount = Math.ceil(Number(video.sizeBytes) / partSize);
  const valid = [...new Set(partNumbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= partCount);
  if (valid.length === 0) throw new HttpError(400, "nothingToUpdate");
  return adapter.getUploadPartUrls(refOf(video), valid.slice(0, MAX_PART_URLS_PER_REQUEST));
}

/** Cuota de almacenamiento por usuario (STORAGE_QUOTA_GB, 0 = sin límite). */
export const storageQuotaBytes = () => {
  const gb = getCoreEnv().STORAGE_QUOTA_GB;
  return gb > 0 ? Math.round(gb * 1024 ** 3) : null;
};

async function assertQuota(userId: string, incomingBytes: number) {
  const quota = storageQuotaBytes();
  if (!quota) return;
  const { _sum } = await prisma.video.aggregate({
    where: { userId, status: { not: "ERROR" } },
    _sum: { sizeBytes: true },
  });
  if (Number(_sum.sizeBytes ?? 0) + incomingBytes > quota) {
    throw new HttpError(413, "storageQuotaReached");
  }
}

export async function confirmUpload(
  userId: string,
  publicId: string,
  hints: { durationSec?: number | null; hasThumbnail?: boolean } = {},
): Promise<PublicVideo> {
  const video = await findOwned(userId, publicId);
  if (video.status !== "PENDING_UPLOAD") return toPublicVideo(video); // idempotente

  const updated = await runConfirm(video, hints.durationSec, hints.hasThumbnail);
  if (updated.status === "PENDING_UPLOAD") {
    throw new HttpError(409, "uploadNotFinished");
  }
  return toPublicVideo(updated);
}

async function runConfirm(
  video: Video,
  clientDurationSec?: number | null,
  clientThumbnail = false,
): Promise<Video> {
  const state = await getAdapter(video.provider).confirmUpload(refOf(video), {
    declaredSizeBytes: Number(video.sizeBytes),
    clientDurationSec,
    maxSizeBytes: maxUploadBytes(),
    clientThumbnail,
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
  if (state.status === "READY" && video.status !== "READY") {
    // Hook del proveedor (p. ej. Stream prepara el MP4 descargable). Sin bloquear.
    const adapter = getAdapter(video.provider);
    adapter.onReady?.(refOf(video)).catch((err) => console.warn("[videos] onReady falló:", err));
  }
  return prisma.video.update({
    where: { id: video.id },
    data: {
      status: state.status,
      durationSec: state.durationSec ?? video.durationSec,
      sizeBytes: state.sizeBytes ? BigInt(state.sizeBytes) : video.sizeBytes,
      providerMeta: Object.keys(meta).length ? meta : Prisma.JsonNull,
      errorReason: state.status === "ERROR" ? (state.errorReason ?? "unknown") : null,
      postProcessPending: state.postProcess ?? video.postProcessPending,
      hasThumbnail: state.hasThumbnail ?? video.hasThumbnail,
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
  if (!video || video.userId !== userId) throw new HttpError(404, "videoNotFound");
  return video;
}

// ---------------------------------------------------------------------------
// Edición (título / carpeta)
// ---------------------------------------------------------------------------
export async function updateVideo(
  userId: string,
  publicId: string,
  patch: { title?: string; folderId?: string | null; allowDownload?: boolean },
): Promise<PublicVideo> {
  const video = await findOwned(userId, publicId);
  if (patch.folderId) await findOwnedFolder(userId, patch.folderId);
  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.folderId !== undefined && { folderId: patch.folderId }),
      ...(patch.allowDownload !== undefined && { allowDownload: patch.allowDownload }),
    },
  });
  return toPublicVideo(updated);
}

/** Mueve varios videos a la vez (arrastrar y soltar, selección múltiple). */
export async function moveVideos(userId: string, publicIds: string[], folderId: string | null) {
  if (folderId) await findOwnedFolder(userId, folderId);
  const { count } = await prisma.video.updateMany({
    where: { userId, publicId: { in: publicIds } },
    data: { folderId },
  });
  return { moved: count };
}

// ---------------------------------------------------------------------------
// Carpetas
// ---------------------------------------------------------------------------
export interface PublicFolder {
  id: string;
  name: string;
  createdAt: string;
}

const toPublicFolder = (f: { id: string; name: string; createdAt: Date }): PublicFolder => ({
  id: f.id,
  name: f.name,
  createdAt: f.createdAt.toISOString(),
});

export async function listFolders(userId: string): Promise<PublicFolder[]> {
  const folders = await prisma.folder.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return folders.map(toPublicFolder);
}

export async function createFolder(userId: string, name: string): Promise<PublicFolder> {
  if ((await prisma.folder.count({ where: { userId } })) >= 200) {
    throw new HttpError(400, "folderLimit");
  }
  try {
    return toPublicFolder(await prisma.folder.create({ data: { userId, name } }));
  } catch (err) {
    throw uniqueNameError(err);
  }
}

export async function renameFolder(userId: string, id: string, name: string): Promise<PublicFolder> {
  await findOwnedFolder(userId, id);
  try {
    return toPublicFolder(await prisma.folder.update({ where: { id }, data: { name } }));
  } catch (err) {
    throw uniqueNameError(err);
  }
}

/** Borra la carpeta; sus videos pasan a "Sin carpeta" (onDelete: SetNull). */
export async function deleteFolder(userId: string, id: string): Promise<void> {
  await findOwnedFolder(userId, id);
  await prisma.folder.delete({ where: { id } });
}

async function findOwnedFolder(userId: string, id: string) {
  const folder = await prisma.folder.findUnique({ where: { id } });
  if (!folder || folder.userId !== userId) throw new HttpError(404, "folderNotFound");
  return folder;
}

function uniqueNameError(err: unknown): unknown {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
    ? new HttpError(409, "folderNameTaken")
    : err;
}

// ---------------------------------------------------------------------------
// Reproducción (embed)
// ---------------------------------------------------------------------------
export type EmbedLookup =
  | { state: "not_found" }
  | { state: "processing"; title: string }
  | { state: "error"; title: string }
  | {
      state: "ready";
      publicId: string;
      title: string;
      durationSec: number | null;
      source: PlaybackSource;
      /** Vacío si el dueño (o la configuración global) no permite descargar. */
      downloads: PublicDownloadOption[];
      /** Ruta firmada a la que el reproductor avisa (una vez) al empezar a reproducir. */
      viewUrl: string;
      /** `null` si el video no está monetizado. */
      monetization: { qualifyAfterSec: number; adSnippet: string } | null;
    };

export interface PublicDownloadOption {
  kind: "original" | "rendition" | "single";
  height: number | null;
  sizeBytes: number | null;
  /** Ruta propia firmada: `/media/<id>/download?q=<calidad>&…` */
  path: string;
}

const downloadsEnabled = (v: Video) => v.allowDownload && getCoreEnv().ALLOW_DOWNLOADS;

/**
 * Datos para el reproductor. Las URLs devueltas son rutas PROPIAS firmadas
 * (`/media/...`); la URL real del proveedor solo se resuelve al pedirlas.
 */
export async function getEmbedPlayback(publicId: string): Promise<EmbedLookup> {
  const video = await prisma.video.findUnique({
    where: { publicId },
    include: { user: { select: { monetizationEnabled: true } } },
  });
  if (!video) return { state: "not_found" };
  if (video.status === "ERROR") return { state: "error", title: video.title };
  if (video.status !== "READY") return { state: "processing", title: video.title };

  // El adaptador decide formato (HLS/MP4) y si hay miniatura; nosotros
  // sustituimos sus URLs por rutas propias antes de enviarlas al navegador.
  const [real, mon] = await Promise.all([providerPlayback(video), getMonetizationSettings()]);
  const downloads = downloadsEnabled(video)
    ? getAdapter(video.provider)
        .listDownloadOptions(refOf(video), Number(video.sizeBytes))
        .map((o) => ({ kind: o.kind, height: o.height ?? null, sizeBytes: o.sizeBytes ?? null, path: mediaPath(publicId, "download", o.id) }))
    : [];
  return {
    state: "ready",
    publicId,
    downloads,
    viewUrl: mediaPath(publicId, "view"),
    monetization:
      mon.enabled && video.user.monetizationEnabled
        ? { qualifyAfterSec: mon.minWatchSeconds, adSnippet: mon.monetagPlayerSnippet }
        : null,
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

/** Resuelve la descarga: URL directa del proveedor (el VPS solo redirige). */
export async function resolveDownload(publicId: string, optionId: string): Promise<DownloadResult | null> {
  const video = await prisma.video.findUnique({ where: { publicId } });
  if (!video || video.status !== "READY" || !downloadsEnabled(video)) return null;
  const result = await getAdapter(video.provider).getDownloadUrl(refOf(video), video.title, optionId);
  if (result.status === "ready") recordDownload(publicId);
  return result;
}

/** Resuelve la URL real (firmada) del proveedor para la ruta `/media`. */
export async function resolveMediaUrl(publicId: string, asset: "source" | "poster"): Promise<string | null> {
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
  throw new HttpError(400, "webhookUnknown");
}
