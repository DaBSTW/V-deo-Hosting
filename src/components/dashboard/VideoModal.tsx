"use client";

import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { Modal } from "../ui/Modal";
import { CodeIcon, ExternalIcon, LinkIcon, PencilIcon, TrashIcon } from "../ui/icons";
import { StatusBadge } from "./StatusBadge";
import type { PublicFolder, PublicVideo, VideoActions } from "./types";
import { VideoThumb } from "./VideoThumb";

/** Detalle rápido: vista previa real del embed + códigos para copiar. */
export function VideoModal({
  video,
  folders,
  actions,
  onClose,
}: {
  video: PublicVideo | null;
  folders: PublicFolder[];
  actions: VideoActions;
  onClose: () => void;
}) {
  if (!video) return null;
  const ready = video.status === "ready";

  return (
    <Modal open onClose={onClose} title={video.title} size="xl">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex items-center bg-black lg:rounded-bl-2xl">
          {ready ? (
            <iframe
              key={video.id}
              src={video.embedUrl}
              title={video.title}
              className="aspect-video w-full"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
            />
          ) : (
            <VideoThumb video={video} />
          )}
        </div>

        <div className="space-y-5 p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Info label="Estado"><StatusBadge status={video.status} /></Info>
            <Info label="Duración">{formatDuration(video.durationSec)}</Info>
            <Info label="Tamaño">{formatBytes(video.sizeBytes)}</Info>
            <Info label="Subido">{formatDate(video.createdAt)}</Info>
          </dl>

          <label className="block">
            <span className="text-xs font-medium text-zinc-500">Carpeta</span>
            <select
              value={video.folderId ?? ""}
              onChange={(e) => actions.move([video.id], e.target.value || null)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Sin carpeta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 px-3.5 py-3">
            <span>
              <span className="block text-sm font-medium text-zinc-800">Permitir descarga</span>
              <span className="block text-xs text-zinc-500">Muestra el botón «Descargar» en el enlace directo.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={video.allowDownload}
              onClick={() => actions.setAllowDownload(video, !video.allowDownload)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${video.allowDownload ? "bg-brand-600" : "bg-zinc-300"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  video.allowDownload ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>

          <CopyField label="Código de inserción" value={video.iframe} multiline disabled={!ready} onCopy={() => actions.copyIframe(video)} icon={<CodeIcon />} />
          <CopyField label="Enlace directo" value={video.watchUrl} disabled={!ready} onCopy={() => actions.copyLink(video)} icon={<LinkIcon />} />

          <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            <SmallButton onClick={() => actions.rename(video)}><PencilIcon /> Renombrar</SmallButton>
            {ready && (
              <SmallButton onClick={() => window.open(video.watchUrl, "_blank", "noopener")}>
                <ExternalIcon /> Abrir
              </SmallButton>
            )}
            <SmallButton danger onClick={() => actions.remove(video)}><TrashIcon /> Eliminar</SmallButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-800">{children}</dd>
    </div>
  );
}

function CopyField({
  label, value, multiline, disabled, onCopy, icon,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  disabled?: boolean;
  onCopy: () => void;
  icon: React.ReactNode;
}) {
  const cls =
    "block w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 outline-none";
  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <button onClick={onCopy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
          {icon} Copiar
        </button>
      </div>
      {multiline ? (
        <textarea readOnly rows={4} value={value} className={cls} onFocus={(e) => e.target.select()} />
      ) : (
        <input readOnly value={value} className={cls} onFocus={(e) => e.target.select()} />
      )}
    </div>
  );
}

function SmallButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}
