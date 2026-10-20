"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { AlertIcon, FilmIcon, PlayIcon } from "../ui/icons";
import type { PublicVideo } from "./types";

/** Miniatura 16:9 con duración y capa de estado. */
export function VideoThumb({ video, size = "lg" }: { video: PublicVideo; size?: "lg" | "sm" }) {
  const [failed, setFailed] = useState(false);
  const showImage = video.thumbnailUrl && !failed;
  const lg = size === "lg";

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <FilmIcon className={`absolute inset-0 m-auto text-zinc-600 ${lg ? "h-9 w-9" : "h-5 w-5"}`} />
      )}

      {video.status === "ready" && lg && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/0 opacity-0 transition group-hover:bg-zinc-950/30 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-lg">
            <PlayIcon className="ml-0.5 h-5 w-5" />
          </span>
        </div>
      )}

      {(video.status === "processing" || video.status === "uploading") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/60 text-white backdrop-blur-[2px]">
          <span className={`animate-spin rounded-full border-2 border-white/30 border-t-white ${lg ? "h-7 w-7" : "h-4 w-4"}`} />
          {lg && <span className="text-xs font-medium">{video.status === "processing" ? "Procesando…" : "Subiendo…"}</span>}
        </div>
      )}

      {video.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-red-950/70 text-red-100">
          <AlertIcon className={lg ? "h-6 w-6" : "h-4 w-4"} />
          {lg && <span className="text-xs font-medium">No disponible</span>}
        </div>
      )}

      {video.durationSec ? (
        <span
          className={`absolute bottom-1.5 right-1.5 rounded-md bg-zinc-950/80 font-medium tabular-nums text-white ${
            lg ? "px-1.5 py-0.5 text-[11px]" : "px-1 text-[10px]"
          }`}
        >
          {formatDuration(video.durationSec)}
        </span>
      ) : null}
    </div>
  );
}
