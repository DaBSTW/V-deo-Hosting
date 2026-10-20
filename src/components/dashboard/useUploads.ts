"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { UploadAbortedError, uploadVideo } from "@/lib/upload-client";
import type { PublicVideo } from "@/server/videos/dto";

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled";

export interface UploadItem {
  key: string;
  file: File;
  title: string;
  folderId: string | null;
  progress: number;
  status: UploadStatus;
  previewUrl?: string;
  error?: string;
  controller: AbortController;
}

const MAX_PARALLEL = 2;
const titleFromFile = (name: string) =>
  name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;

/** Cola de subidas (máx. 2 en paralelo), independiente de la vista. */
export function useUploads(maxBytes: number, onUploaded: (video: PublicVideo) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(new Set<string>());

  const patch = useCallback((key: string, p: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  const add = useCallback(
    (files: FileList | File[], folderId: string | null) => {
      const next = Array.from(files).map<UploadItem>((file) => {
        const base = {
          key: crypto.randomUUID(),
          file,
          folderId,
          title: titleFromFile(file.name),
          progress: 0,
          controller: new AbortController(),
        };
        if (file.type && !file.type.startsWith("video/")) {
          return { ...base, status: "error", error: "No es un archivo de video" };
        }
        if (file.size > maxBytes) {
          return { ...base, status: "error", error: `Supera el máximo (${formatBytes(maxBytes)})` };
        }
        return { ...base, status: "queued" };
      });
      setItems((prev) => [...prev, ...next]);
    },
    [maxBytes],
  );

  const cancel = useCallback(
    (item: UploadItem) => {
      if (item.status === "queued") patch(item.key, { status: "canceled" });
      else item.controller.abort();
    },
    [patch],
  );

  useEffect(() => {
    const free = MAX_PARALLEL - running.current.size;
    const queued = items
      .filter((i) => i.status === "queued" && !running.current.has(i.key))
      .slice(0, Math.max(0, free));

    for (const item of queued) {
      running.current.add(item.key);
      patch(item.key, { status: "uploading" });
      void (async () => {
        try {
          const video = await uploadVideo(item.file, item.title, item.folderId, {
            signal: item.controller.signal,
            onProgress: (f) => patch(item.key, { progress: f }),
            onPreview: (url) => patch(item.key, { previewUrl: url }),
          });
          running.current.delete(item.key);
          patch(item.key, { status: "done", progress: 1 });
          onUploaded(video);
          setTimeout(() => remove(item.key), 4000);
        } catch (err) {
          running.current.delete(item.key);
          patch(
            item.key,
            err instanceof UploadAbortedError
              ? { status: "canceled" }
              : { status: "error", error: (err as Error).message },
          );
        }
      })();
    }
  }, [items, onUploaded, patch, remove]);

  // Evita cerrar la pestaña con subidas en curso.
  const busy = items.some((i) => i.status === "uploading" || i.status === "queued");
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  return { items, add, cancel, remove, busy };
}
