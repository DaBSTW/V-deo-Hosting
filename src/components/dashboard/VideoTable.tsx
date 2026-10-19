"use client";

import { useState } from "react";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import type { PublicVideo } from "@/server/videos/dto";
import { CodeIcon, LinkIcon, PlayIcon, TrashIcon } from "../ui/icons";
import { StatusBadge } from "./StatusBadge";

export function VideoTable({
  videos,
  onDeleted,
  notify,
}: {
  videos: PublicVideo[];
  onDeleted: (id: string) => void;
  notify: (msg: string) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copiado al portapapeles`);
    } catch {
      window.prompt(`Copia el ${what.toLowerCase()}:`, text);
    }
  }

  async function remove(v: PublicVideo) {
    if (!window.confirm(`¿Eliminar "${v.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(v.id);
    try {
      const res = await fetch(`/api/videos/${v.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el video");
      }
      onDeleted(v.id);
      notify("Video eliminado");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium">Aún no tienes videos</p>
        <p className="mt-1 text-sm text-zinc-500">Sube tu primer video para obtener su código de inserción.</p>
      </div>
    );
  }

  const actions = (v: PublicVideo) => {
    const ready = v.status === "ready";
    const btn =
      "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40";
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={btn} disabled={!ready} onClick={() => copy(v.iframe, "Código iFrame")} title="Copiar código iFrame">
          <CodeIcon /> iFrame
        </button>
        <button className={btn} disabled={!ready} onClick={() => copy(v.watchUrl, "Enlace")} title="Copiar enlace directo">
          <LinkIcon /> Enlace
        </button>
        <a
          className={`${btn} ${ready ? "" : "pointer-events-none opacity-40"}`}
          href={v.watchUrl}
          target="_blank"
          rel="noreferrer"
          title="Ver"
          aria-label="Ver video"
        >
          <PlayIcon />
        </a>
        <button
          className={`${btn} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
          disabled={deleting === v.id}
          onClick={() => remove(v)}
          title="Borrar"
          aria-label="Borrar video"
        >
          <TrashIcon />
        </button>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* Escritorio */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Duración</th>
            <th className="px-4 py-3 font-medium">Tamaño</th>
            <th className="px-4 py-3 font-medium">Subido</th>
            <th className="px-4 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {videos.map((v) => (
            <tr key={v.id} className="hover:bg-zinc-50/60">
              <td className="max-w-xs truncate px-4 py-3 font-medium" title={v.title}>{v.title}</td>
              <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
              <td className="px-4 py-3 tabular-nums text-zinc-600">{formatDuration(v.durationSec)}</td>
              <td className="px-4 py-3 tabular-nums text-zinc-600">{formatBytes(v.sizeBytes)}</td>
              <td className="px-4 py-3 text-zinc-600">{formatDate(v.createdAt)}</td>
              <td className="px-4 py-3">{actions(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Móvil */}
      <ul className="divide-y divide-zinc-100 md:hidden">
        {videos.map((v) => (
          <li key={v.id} className="space-y-2 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">{v.title}</p>
              <StatusBadge status={v.status} />
            </div>
            <p className="text-xs text-zinc-500">
              {formatDuration(v.durationSec)} · {formatBytes(v.sizeBytes)} · {formatDate(v.createdAt)}
            </p>
            {actions(v)}
          </li>
        ))}
      </ul>
    </div>
  );
}
