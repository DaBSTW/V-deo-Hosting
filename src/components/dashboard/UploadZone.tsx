"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { formatBytes } from "@/lib/format";
import { UploadAbortedError, uploadVideo } from "@/lib/upload-client";
import type { PublicVideo } from "@/server/videos/dto";
import { UploadIcon, XIcon } from "../ui/icons";

type ItemStatus = "queued" | "uploading" | "done" | "error" | "canceled";

interface Item {
  key: string;
  file: File;
  title: string;
  progress: number;
  status: ItemStatus;
  error?: string;
  controller: AbortController;
}

const MAX_PARALLEL = 2;
const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;

export function UploadZone({
  maxBytes,
  onUploaded,
}: {
  maxBytes: number;
  onUploaded: (video: PublicVideo) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const running = useRef(new Set<string>());

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const next: Item[] = Array.from(files).map((file) => {
        const base = {
          key: crypto.randomUUID(),
          file,
          title: titleFromFile(file.name),
          progress: 0,
          controller: new AbortController(),
        };
        if (!file.type.startsWith("video/") && file.type !== "") {
          return { ...base, status: "error", error: "No es un archivo de video" };
        }
        if (file.size > maxBytes) {
          return { ...base, status: "error", error: `Supera el máximo (${formatBytes(maxBytes)})` };
        }
        return { ...base, status: "queued" };
      });
      setItems((prev) => [...next, ...prev]);
    },
    [maxBytes],
  );

  // Cola: arranca hasta MAX_PARALLEL subidas a la vez.
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
          const video = await uploadVideo(item.file, item.title, {
            signal: item.controller.signal,
            onProgress: (f) => patch(item.key, { progress: f }),
          });
          running.current.delete(item.key);
          patch(item.key, { status: "done", progress: 1 });
          onUploaded(video);
          setTimeout(() => setItems((prev) => prev.filter((i) => i.key !== item.key)), 2500);
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
  }, [items, onUploaded, patch]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <section>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-zinc-300 bg-white hover:border-zinc-400"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <UploadIcon className="h-6 w-6" />
        </div>
        <p className="mt-4 text-sm font-medium">Arrastra tus videos aquí o haz clic para elegirlos</p>
        <p className="mt-1 text-xs text-zinc-500">MP4, WebM, MOV… · Máximo {formatBytes(maxBytes)} por archivo</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-zinc-500">
                    {formatBytes(item.file.size)} · {label(item)}
                  </p>
                </div>
                {(item.status === "uploading" || item.status === "queued") && (
                  <button
                    onClick={() =>
                      item.status === "queued"
                        ? patch(item.key, { status: "canceled" })
                        : item.controller.abort()
                    }
                    className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Cancelar subida"
                  >
                    <XIcon />
                  </button>
                )}
                {(item.status === "error" || item.status === "canceled") && (
                  <button
                    onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                    className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Descartar"
                  >
                    <XIcon />
                  </button>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    item.status === "error" ? "bg-red-500" : item.status === "done" ? "bg-emerald-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function label(item: Item): string {
  switch (item.status) {
    case "queued":
      return "En cola";
    case "uploading":
      return item.progress >= 1 ? "Finalizando…" : `Subiendo ${Math.round(item.progress * 100)}%`;
    case "done":
      return "Completado";
    case "canceled":
      return "Cancelado";
    case "error":
      return item.error ?? "Error";
  }
}
