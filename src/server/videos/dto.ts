/**
 * Frontera de opacidad: TODO video que sale hacia el cliente pasa por aquí.
 * Solo se copian campos de lista blanca; `provider`, `providerVideoId`,
 * `providerMeta`, `errorReason`, etc. nunca abandonan el servidor.
 */
import type { Video } from "@prisma/client";
import { getCoreEnv } from "@/lib/env";
import { mediaPath } from "./playback-token";

export type PublicVideoStatus = "uploading" | "processing" | "ready" | "error";

export interface PublicVideo {
  id: string;
  title: string;
  status: PublicVideoStatus;
  durationSec: number | null;
  sizeBytes: number;
  createdAt: string;
  folderId: string | null;
  /** Ruta propia firmada (`/media/.../poster`) o `null` si aún no hay miniatura. */
  thumbnailUrl: string | null;
  embedUrl: string;
  watchUrl: string;
  iframe: string;
}

const STATUS_MAP: Record<Video["status"], PublicVideoStatus> = {
  PENDING_UPLOAD: "uploading",
  PROCESSING: "processing",
  READY: "ready",
  ERROR: "error",
};

export function embedUrlFor(publicId: string) {
  return `${getCoreEnv().APP_URL}/embed/${publicId}`;
}

export function iframeFor(publicId: string, title: string) {
  const safeTitle = title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return (
    `<iframe src="${embedUrlFor(publicId)}" title="${safeTitle}" width="640" height="360" ` +
    `style="border:0;max-width:100%;aspect-ratio:16/9;height:auto" ` +
    `allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy"></iframe>`
  );
}

export function toPublicVideo(v: Video): PublicVideo {
  return {
    id: v.publicId,
    title: v.title,
    status: STATUS_MAP[v.status],
    durationSec: v.durationSec,
    sizeBytes: Number(v.sizeBytes),
    createdAt: v.createdAt.toISOString(),
    folderId: v.folderId,
    thumbnailUrl: v.hasThumbnail && v.status === "READY" ? mediaPath(v.publicId, "poster") : null,
    embedUrl: embedUrlFor(v.publicId),
    watchUrl: `${getCoreEnv().APP_URL}/v/${v.publicId}`,
    iframe: iframeFor(v.publicId, v.title),
  };
}
