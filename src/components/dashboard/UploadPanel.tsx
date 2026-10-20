"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { ChevronDownIcon, CheckIcon, FilmIcon, XIcon } from "../ui/icons";
import type { UploadItem } from "./useUploads";

/** Panel flotante de progreso (estilo gestor de descargas). */
export function UploadPanel({
  items,
  onCancel,
  onDismiss,
}: {
  items: UploadItem[];
  onCancel: (item: UploadItem) => void;
  onDismiss: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;

  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length;
  const title = active > 0 ? `Subiendo ${active} ${active === 1 ? "video" : "videos"}` : "Subidas finalizadas";

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-900/15">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between bg-zinc-900 px-4 py-3 text-sm font-medium text-white"
      >
        {title}
        <ChevronDownIcon className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} />
      </button>
      {!collapsed && (
        <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-4 py-3">
              <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FilmIcon className="absolute inset-0 m-auto h-5 w-5 text-zinc-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className={`truncate text-xs ${item.status === "error" ? "text-red-600" : "text-zinc-500"}`}>
                  {statusText(item)}
                </p>
                {(item.status === "uploading" || item.status === "queued") && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {item.status === "done" ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              ) : (
                <button
                  onClick={() =>
                    item.status === "uploading" || item.status === "queued" ? onCancel(item) : onDismiss(item.key)
                  }
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label={item.status === "uploading" || item.status === "queued" ? "Cancelar" : "Descartar"}
                >
                  <XIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "queued":
      return `En cola · ${formatBytes(item.file.size)}`;
    case "uploading":
      return item.progress >= 1
        ? "Finalizando…"
        : `${Math.round(item.progress * 100)} % · ${formatBytes(item.file.size)}`;
    case "done":
      return "Completado";
    case "canceled":
      return "Cancelado";
    case "error":
      return item.error ?? "Error";
  }
}
