"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicVideo } from "@/server/videos/dto";
import { UploadZone } from "./UploadZone";
import { VideoTable } from "./VideoTable";

const POLL_MS = 5000;

export function DashboardClient({
  initialVideos,
  maxBytes,
}: {
  initialVideos: PublicVideo[];
  maxBytes: number;
}) {
  const [videos, setVideos] = useState(initialVideos);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const onUploaded = useCallback((video: PublicVideo) => {
    setVideos((prev) => [video, ...prev.filter((v) => v.id !== video.id)]);
  }, []);

  // Mientras haya videos procesándose, refrescamos su estado periódicamente.
  const hasPending = videos.some((v) => v.status === "processing" || v.status === "uploading");
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/videos", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setVideos((await res.json()).videos);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasPending]);

  return (
    <div className="space-y-8">
      <UploadZone maxBytes={maxBytes} onUploaded={onUploaded} />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Mis videos</h2>
          <span className="text-sm text-zinc-500">{videos.length} en total</span>
        </div>
        <VideoTable
          videos={videos}
          notify={notify}
          onDeleted={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
        />
      </section>

      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 flex justify-center transition-opacity ${
          toast ? "opacity-100" : "opacity-0"
        }`}
      >
        {toast && (
          <div className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        )}
      </div>
    </div>
  );
}
