"use client";

import type { DragEvent } from "react";
import { formatBytes, formatCount, formatRelative } from "@/lib/format";
import { Menu } from "../ui/Menu";
import { CheckIcon, DotsIcon, FolderIcon } from "../ui/icons";
import { StatusBadge } from "./StatusBadge";
import { DRAG_MIME, type PublicFolder, type PublicVideo, type VideoActions } from "./types";
import { videoMenuItems } from "./videoMenu";
import { VideoThumb } from "./VideoThumb";

interface ViewProps {
  videos: PublicVideo[];
  folders: PublicFolder[];
  actions: VideoActions;
  selected: Set<string>;
  onToggleSelect: (id: string, range: boolean) => void;
}

/** Arrastrar: si el video está seleccionado se arrastra toda la selección. */
function dragStart(e: DragEvent, v: PublicVideo, selected: Set<string>) {
  const ids = selected.has(v.id) ? [...selected] : [v.id];
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "move";
}

function SelectBox({ checked, onToggle, className = "" }: { checked: boolean; onToggle: (range: boolean) => void; className?: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label="Seleccionar"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
        checked ? "border-brand-600 bg-brand-600 text-white" : "border-white/80 bg-zinc-950/30 text-transparent hover:bg-zinc-950/50"
      } ${className}`}
    >
      <CheckIcon className="h-3.5 w-3.5" />
    </button>
  );
}

function MoreButton({ v, actions, folders }: { v: PublicVideo; actions: VideoActions; folders: PublicFolder[] }) {
  return (
    <Menu
      label="Acciones del video"
      items={videoMenuItems(v, actions, folders)}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-label="Más acciones"
          className={`rounded-lg p-1.5 transition ${open ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"}`}
        >
          <DotsIcon />
        </button>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Cuadrícula
// ---------------------------------------------------------------------------
export function VideoGrid({ videos, folders, actions, selected, onToggleSelect }: ViewProps) {
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  const selecting = selected.size > 0;

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {videos.map((v) => {
        const isSel = selected.has(v.id);
        return (
          <li
            key={v.id}
            draggable
            onDragStart={(e) => dragStart(e, v, selected)}
            className={`group relative rounded-2xl bg-white ring-1 transition duration-200 has-[[role=menu]]:z-20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-900/[0.07] ${
              isSel ? "ring-2 ring-brand-500" : "ring-zinc-200/80"
            }`}
          >
            <button
              onClick={() => (selecting ? onToggleSelect(v.id, false) : actions.open(v))}
              className="block w-full overflow-hidden rounded-t-2xl text-left"
              aria-label={`Abrir ${v.title}`}
            >
              <VideoThumb video={v} />
            </button>
            <SelectBox
              checked={isSel}
              onToggle={(range) => onToggleSelect(v.id, range)}
              className={`absolute left-2.5 top-2.5 ${isSel || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            />
            <div className="flex items-start gap-2 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900" title={v.title}>{v.title}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  {v.status === "ready" ? (
                    <span>{formatCount(v.views)} {v.views === 1 ? "reproducción" : "reproducciones"}</span>
                  ) : (
                    <StatusBadge status={v.status} />
                  )}
                  <span className="text-zinc-300">·</span>
                  <span className="truncate">{formatRelative(v.createdAt)}</span>
                </div>
                {folderName(v.folderId) && (
                  <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
                    <FolderIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{folderName(v.folderId)}</span>
                  </span>
                )}
              </div>
              <MoreButton v={v} actions={actions} folders={folders} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------
export function VideoList({ videos, folders, actions, selected, onToggleSelect }: ViewProps) {
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? "—";

  return (
    <div className="overflow-visible rounded-2xl bg-white ring-1 ring-zinc-200/80">
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_90px_110px_130px_40px] items-center gap-4 border-b border-zinc-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 md:grid">
        <span>Video</span>
        <span>Estado</span>
        <span>Tamaño</span>
        <span>Carpeta</span>
        <span>Subido</span>
        <span />
      </div>
      <ul className="divide-y divide-zinc-100">
        {videos.map((v) => {
          const isSel = selected.has(v.id);
          return (
            <li
              key={v.id}
              draggable
              onDragStart={(e) => dragStart(e, v, selected)}
              className={`group grid grid-cols-[minmax(0,1fr)_40px] items-center gap-4 px-4 py-2.5 transition md:grid-cols-[minmax(0,1fr)_120px_90px_110px_130px_40px] ${
                isSel ? "bg-brand-50/60" : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <SelectBox
                  checked={isSel}
                  onToggle={(range) => onToggleSelect(v.id, range)}
                  className={`shrink-0 !border-zinc-300 ${isSel ? "" : "!bg-white"}`}
                />
                <button onClick={() => actions.open(v)} className="group/thumb w-28 shrink-0 overflow-hidden rounded-lg">
                  <VideoThumb video={v} size="sm" />
                </button>
                <button onClick={() => actions.open(v)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-medium text-zinc-900">{v.title}</p>
                  <p className="text-xs text-zinc-500 md:hidden">
                    {formatBytes(v.sizeBytes)} · {formatRelative(v.createdAt)}
                  </p>
                </button>
              </div>
              <div className="hidden md:block"><StatusBadge status={v.status} /></div>
              <span className="hidden text-sm tabular-nums text-zinc-600 md:block">{formatBytes(v.sizeBytes)}</span>
              <span className="hidden truncate text-sm text-zinc-600 md:block">{folderName(v.folderId)}</span>
              <span className="hidden text-sm text-zinc-600 md:block">{formatRelative(v.createdAt)}</span>
              <MoreButton v={v} actions={actions} folders={folders} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
