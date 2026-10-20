"use client";

import { useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";
import { formatBytes } from "@/lib/format";
import { Menu } from "../ui/Menu";
import {
  DotsIcon, FolderIcon, FolderPlusIcon, InboxIcon, LibraryIcon, LogoutIcon, PencilIcon, PlayIcon, TrashIcon, UploadIcon,
} from "../ui/icons";
import { DRAG_MIME, type FolderFilter, type PublicFolder } from "./types";

interface Props {
  user: { email: string; name: string | null };
  folders: PublicFolder[];
  counts: { all: number; none: number; byFolder: Map<string, number> };
  totalBytes: number;
  filter: FolderFilter;
  onFilter: (f: FolderFilter) => void;
  onUpload: () => void;
  onCreateFolder: (name: string) => Promise<boolean>;
  onRenameFolder: (f: PublicFolder) => void;
  onDeleteFolder: (f: PublicFolder) => void;
  onDropVideos: (ids: string[], folderId: string | null) => void;
  onLogout: () => void;
}

export function Sidebar(p: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const isActive = (f: FolderFilter) =>
    f.kind === p.filter.kind && (f.kind !== "folder" || (p.filter.kind === "folder" && p.filter.id === f.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setCreating(false);
    if (await p.onCreateFolder(name.trim())) {
      setName("");
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
          <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      <div className="px-3">
        <button
          onClick={p.onUpload}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
        >
          <UploadIcon /> Subir videos
        </button>
      </div>

      <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
        <SectionTitle>Biblioteca</SectionTitle>
        <NavItem
          icon={<LibraryIcon />}
          label="Todos los videos"
          count={p.counts.all}
          active={isActive({ kind: "all" })}
          onClick={() => p.onFilter({ kind: "all" })}
        />
        <NavItem
          icon={<InboxIcon />}
          label="Sin carpeta"
          count={p.counts.none}
          active={isActive({ kind: "none" })}
          onClick={() => p.onFilter({ kind: "none" })}
          onDropVideos={(ids) => p.onDropVideos(ids, null)}
        />

        <div className="mt-6 flex items-center justify-between pr-1">
          <SectionTitle>Carpetas</SectionTitle>
          <button
            onClick={() => setCreating(true)}
            className="mb-1.5 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700"
            aria-label="Nueva carpeta"
            title="Nueva carpeta"
          >
            <FolderPlusIcon />
          </button>
        </div>

        {creating && (
          <form onSubmit={submit} className="mb-1 px-1">
            <input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => e.key === "Escape" && (setName(""), setCreating(false))}
              placeholder="Nombre de la carpeta"
              className="w-full rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-sm outline-none ring-2 ring-brand-100"
            />
          </form>
        )}

        {p.folders.map((f) => (
          <NavItem
            key={f.id}
            icon={<FolderIcon />}
            label={f.name}
            count={p.counts.byFolder.get(f.id) ?? 0}
            active={isActive({ kind: "folder", id: f.id })}
            onClick={() => p.onFilter({ kind: "folder", id: f.id })}
            onDropVideos={(ids) => p.onDropVideos(ids, f.id)}
            menu={
              <Menu
                label="Opciones de carpeta"
                items={[
                  { label: "Renombrar", icon: <PencilIcon />, onSelect: () => p.onRenameFolder(f) },
                  { label: "Eliminar carpeta", icon: <TrashIcon />, onSelect: () => p.onDeleteFolder(f), danger: true },
                ]}
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700" aria-label="Opciones">
                    <DotsIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              />
            }
          />
        ))}

        {p.folders.length === 0 && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-xs text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
          >
            Crea una carpeta para organizar tus videos
          </button>
        )}
      </nav>

      <div className="border-t border-zinc-200/80 p-3">
        <div className="rounded-xl bg-zinc-100/80 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Almacenamiento</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-800">
            {formatBytes(p.totalBytes)} <span className="font-normal text-zinc-500">· {p.counts.all} videos</span>
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold uppercase text-white">
            {(p.user.name ?? p.user.email).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            {p.user.name && <p className="truncate text-sm font-medium">{p.user.name}</p>}
            <p className="truncate text-xs text-zinc-500">{p.user.email}</p>
          </div>
          <button onClick={p.onLogout} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-800" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogoutIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{children}</p>;
}

function NavItem({
  icon, label, count, active, onClick, onDropVideos, menu,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDropVideos?: (ids: string[]) => void;
  menu?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => !!onDropVideos && e.dataTransfer.types.includes(DRAG_MIME);

  return (
    <div
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onDropVideos!(JSON.parse(e.dataTransfer.getData(DRAG_MIME)));
      }}
      className={`group/nav flex items-center rounded-lg pr-1.5 transition ${
        over ? "bg-brand-100 ring-2 ring-brand-400" : active ? "bg-white shadow-sm ring-1 ring-zinc-200" : "hover:bg-zinc-200/50"
      }`}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm">
        <span className={active ? "text-brand-600" : "text-zinc-400"}>{icon}</span>
        <span className={`min-w-0 flex-1 truncate ${active ? "font-medium text-zinc-900" : "text-zinc-600"}`}>{label}</span>
        <span className={`text-xs tabular-nums ${active ? "text-zinc-500" : "text-zinc-400"} ${menu ? "group-focus-within/nav:hidden group-hover/nav:hidden" : ""}`}>{count}</span>
      </button>
      {menu && <div className="hidden group-focus-within/nav:block group-hover/nav:block">{menu}</div>}
    </div>
  );
}
