"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialogs, type DialogState } from "../ui/Dialogs";
import { Menu } from "../ui/Menu";
import {
  ChartIcon, CogIcon, CoinsIcon, FolderIcon, GridIcon, InboxIcon, ListIcon, MenuIcon, SearchIcon, TrashIcon, UploadIcon, XIcon,
} from "../ui/icons";
import type { DashboardStats } from "@/server/videos/stats";
import { AdminView } from "./monetization/AdminView";
import { MonetizationView } from "./monetization/MonetizationView";
import { Overview } from "./overview/Overview";
import { Sidebar } from "./Sidebar";
import { DRAG_MIME, type FolderFilter, type PublicFolder, type PublicVideo, type VideoActions } from "./types";
import { UploadPanel } from "./UploadPanel";
import { useUploads } from "./useUploads";
import { VideoModal } from "./VideoModal";
import { VideoGrid, VideoList } from "./VideoViews";

type View = "grid" | "list";
type Sort = "new" | "old" | "name" | "size";
const POLL_MS = 5000;

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "No se pudo completar la operación");
  return data as T;
}

const readPref = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
};

export function DashboardApp({
  user,
  initialVideos,
  initialFolders,
  initialFilter,
  initialStats,
  maxBytes,
}: {
  user: { email: string; name: string | null; isAdmin: boolean };
  initialVideos: PublicVideo[];
  initialFolders: PublicFolder[];
  initialFilter: FolderFilter;
  initialStats: DashboardStats;
  maxBytes: number;
}) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);
  const [folders, setFolders] = useState(initialFolders);
  const [filter, setFilter] = useState<FolderFilter>(initialFilter);
  const [stats, setStats] = useState(initialStats);
  const [statsLoading, setStatsLoading] = useState(false);
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("new");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fileDrag, setFileDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSelected = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setView(readPref<View>("dash:view", "grid")), []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("dash:view", v);
    } catch {}
  };

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ------------------------------------------------------------------ filtro
  const changeFilter = (f: FolderFilter) => {
    setFilter(f);
    setSelected(new Set());
    if (f.kind === "overview") void refreshStats();
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    if (f.kind === "overview") url.searchParams.delete("folder");
    else url.searchParams.set("folder", f.kind === "folder" ? f.id : f.kind);
    window.history.replaceState(null, "", url);
  };

  // Si se borra la carpeta abierta, volvemos a "Todos".
  useEffect(() => {
    if (filter.kind === "folder" && !folders.some((f) => f.id === filter.id)) setFilter({ kind: "all" });
  }, [folders, filter]);

  const currentFolderId = filter.kind === "folder" ? filter.id : null;
  const currentFolder = folders.find((f) => f.id === currentFolderId);
  const isOverview = filter.kind === "overview";
  /** Vistas que no son de biblioteca (sin búsqueda, orden ni selección). */
  const isPanel = isOverview || filter.kind === "monetization" || filter.kind === "admin";
  const title =
    filter.kind === "overview"
      ? "Resumen"
      : filter.kind === "monetization"
        ? "Monetización"
        : filter.kind === "admin"
          ? "Administración"
          : filter.kind === "all"
        ? "Todos los videos"
        : filter.kind === "none"
          ? "Sin carpeta"
          : currentFolder?.name ?? "";

  // Estadísticas: se refrescan al volver al Resumen y cada minuto mientras está abierto.
  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    const data = await api<DashboardStats>("/api/stats").catch(() => null);
    if (data) setStats(data);
    setStatsLoading(false);
  }, []);
  useEffect(() => {
    if (!isOverview) return;
    const id = setInterval(refreshStats, 60_000);
    return () => clearInterval(id);
  }, [isOverview, refreshStats]);

  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    let none = 0;
    for (const v of videos) {
      if (v.folderId) byFolder.set(v.folderId, (byFolder.get(v.folderId) ?? 0) + 1);
      else none++;
    }
    return { all: videos.length, none, byFolder };
  }, [videos]);

  const totalBytes = useMemo(() => videos.reduce((acc, v) => acc + v.sizeBytes, 0), [videos]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = videos.filter(
      (v) =>
        (filter.kind === "all" ||
          isPanel ||
          (filter.kind === "none" ? !v.folderId : v.folderId === filter.id)) &&
        (!q || v.title.toLowerCase().includes(q)),
    );
    const cmp: Record<Sort, (a: PublicVideo, b: PublicVideo) => number> = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      old: (a, b) => a.createdAt.localeCompare(b.createdAt),
      name: (a, b) => a.title.localeCompare(b.title, "es", { numeric: true }),
      size: (a, b) => b.sizeBytes - a.sizeBytes,
    };
    return list.sort(cmp[sort]);
  }, [videos, filter, query, sort]);

  // ------------------------------------------------------------------ sondeo
  const hasPending = videos.some((v) => v.status === "processing" || v.status === "uploading");
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(async () => {
      const data = await api<{ videos: PublicVideo[] }>("/api/videos").catch(() => null);
      if (data) setVideos(data.videos);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasPending]);

  // ------------------------------------------------------------------ subidas
  const onUploaded = useCallback((video: PublicVideo) => {
    setVideos((prev) => [video, ...prev.filter((v) => v.id !== video.id)]);
  }, []);
  const uploads = useUploads(maxBytes, onUploaded);

  // ------------------------------------------------------------------ acciones
  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify(`${what} copiado`);
      } catch {
        window.prompt(`Copia el ${what.toLowerCase()}:`, text);
      }
    },
    [notify],
  );

  const move = useCallback(
    async (ids: string[], folderId: string | null) => {
      const before = videos;
      setVideos((prev) => prev.map((v) => (ids.includes(v.id) ? { ...v, folderId } : v)));
      setSelected(new Set());
      try {
        await api("/api/videos/move", { method: "POST", body: JSON.stringify({ videoIds: ids, folderId }) });
        const dest = folderId ? folders.find((f) => f.id === folderId)?.name : "Sin carpeta";
        notify(`${ids.length === 1 ? "Video movido" : `${ids.length} videos movidos`} a «${dest}»`);
      } catch (err) {
        setVideos(before);
        notify((err as Error).message);
      }
    },
    [videos, folders, notify],
  );

  const deleteMany = useCallback(
    async (ids: string[]) => {
      let ok = 0;
      for (const id of ids) {
        try {
          await api(`/api/videos/${id}`, { method: "DELETE" });
          ok++;
          setVideos((prev) => prev.filter((v) => v.id !== id));
        } catch (err) {
          notify((err as Error).message);
        }
      }
      setSelected(new Set());
      setOpenId((cur) => (cur && ids.includes(cur) ? null : cur));
      if (ok) notify(ok === 1 ? "Video eliminado" : `${ok} videos eliminados`);
    },
    [notify],
  );

  const actions: VideoActions = useMemo(
    () => ({
      open: (v) => setOpenId(v.id),
      copyIframe: (v) => copy(v.iframe, "Código iFrame"),
      copyLink: (v) => copy(v.watchUrl, "Enlace"),
      move,
      rename: (v) =>
        setDialog({
          kind: "prompt",
          title: "Renombrar video",
          label: "Título",
          initial: v.title,
          confirmLabel: "Guardar",
          onSubmit: async (title) => {
            try {
              const { video } = await api<{ video: PublicVideo }>(`/api/videos/${v.id}`, {
                method: "PATCH",
                body: JSON.stringify({ title }),
              });
              setVideos((prev) => prev.map((x) => (x.id === video.id ? video : x)));
              return true;
            } catch (err) {
              notify((err as Error).message);
              return false;
            }
          },
        }),
      setAllowDownload: async (v, allow) => {
        setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, allowDownload: allow } : x)));
        try {
          await api(`/api/videos/${v.id}`, { method: "PATCH", body: JSON.stringify({ allowDownload: allow }) });
          notify(allow ? "Descarga activada" : "Descarga desactivada");
        } catch (err) {
          setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, allowDownload: !allow } : x)));
          notify((err as Error).message);
        }
      },
      remove: (v) =>
        setDialog({
          kind: "confirm",
          title: "Eliminar video",
          message: `Se eliminará «${v.title}» de forma permanente y su código de inserción dejará de funcionar.`,
          confirmLabel: "Eliminar",
          danger: true,
          onConfirm: () => deleteMany([v.id]),
        }),
    }),
    [copy, move, deleteMany, notify],
  );

  // ------------------------------------------------------------------ carpetas
  const createFolder = async (name: string) => {
    try {
      const { folder } = await api<{ folder: PublicFolder }>("/api/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, "es")));
      changeFilter({ kind: "folder", id: folder.id });
      return true;
    } catch (err) {
      notify((err as Error).message);
      return false;
    }
  };

  const renameFolder = (f: PublicFolder) =>
    setDialog({
      kind: "prompt",
      title: "Renombrar carpeta",
      label: "Nombre",
      initial: f.name,
      maxLength: 60,
      confirmLabel: "Guardar",
      onSubmit: async (name) => {
        try {
          const { folder } = await api<{ folder: PublicFolder }>(`/api/folders/${f.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
          });
          setFolders((prev) => prev.map((x) => (x.id === folder.id ? folder : x)).sort((a, b) => a.name.localeCompare(b.name, "es")));
          return true;
        } catch (err) {
          notify((err as Error).message);
          return false;
        }
      },
    });

  const deleteFolder = (f: PublicFolder) =>
    setDialog({
      kind: "confirm",
      title: "Eliminar carpeta",
      message: `Se eliminará la carpeta «${f.name}». Sus ${counts.byFolder.get(f.id) ?? 0} videos no se borran: pasarán a «Sin carpeta».`,
      confirmLabel: "Eliminar carpeta",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`/api/folders/${f.id}`, { method: "DELETE" });
          setFolders((prev) => prev.filter((x) => x.id !== f.id));
          setVideos((prev) => prev.map((v) => (v.folderId === f.id ? { ...v, folderId: null } : v)));
          notify("Carpeta eliminada");
        } catch (err) {
          notify((err as Error).message);
        }
      },
    });

  // ------------------------------------------------------------------ selección
  const toggleSelect = (id: string, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (range && lastSelected.current) {
        const ids = visible.map((v) => v.id);
        const [a, b] = [ids.indexOf(lastSelected.current), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) ids.slice(a, b + 1).forEach((x) => next.add(x));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      lastSelected.current = id;
      return next;
    });
  };

  // ------------------------------------------------------------------ arrastrar archivos
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes(DRAG_MIME);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const openVideo = videos.find((v) => v.id === openId) ?? null;
  const sidebar = (
    <Sidebar
      user={user}
      folders={folders}
      counts={counts}
      totalBytes={totalBytes}
      filter={filter}
      onFilter={changeFilter}
      onUpload={() => fileInput.current?.click()}
      onCreateFolder={createFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={deleteFolder}
      onDropVideos={move}
      onLogout={logout}
    />
  );

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files, currentFolderId);
          e.target.value = "";
        }}
      />

      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-zinc-200/80 bg-zinc-50/95 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {/* Sidebar móvil (drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-zinc-50 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div
        className="relative flex min-w-0 flex-1 flex-col lg:pl-64"
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setFileDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setFileDrag(false);
          uploads.add(e.dataTransfer.files, currentFolderId);
        }}
      >
        {/* Barra superior */}
        <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden" aria-label="Menú">
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-base font-semibold tracking-tight">
                {filter.kind === "folder" ? (
                  <FolderIcon className="h-4 w-4 text-zinc-400" />
                ) : filter.kind === "none" ? (
                  <InboxIcon className="h-4 w-4 text-zinc-400" />
                ) : isOverview ? (
                  <ChartIcon className="h-4 w-4 text-zinc-400" />
                ) : filter.kind === "monetization" ? (
                  <CoinsIcon className="h-4 w-4 text-zinc-400" />
                ) : filter.kind === "admin" ? (
                  <CogIcon className="h-4 w-4 text-zinc-400" />
                ) : null}
                <span className="truncate">{title}</span>
              </h1>
              <p className="text-xs text-zinc-500">
                {isOverview
                  ? "Tu actividad y el estado de tu biblioteca"
                  : filter.kind === "monetization"
                    ? "Tus ganancias, tarifas y pagos"
                    : filter.kind === "admin"
                      ? "Monetag, tarifas y pagos a usuarios"
                      : `${visible.length} ${visible.length === 1 ? "video" : "videos"}`}
              </p>
            </div>

            {!isPanel && (
            <>
            <div className="relative hidden md:block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar videos…"
                className="w-64 rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="hidden rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none sm:block"
              aria-label="Ordenar"
            >
              <option value="new">Más recientes</option>
              <option value="old">Más antiguos</option>
              <option value="name">Nombre</option>
              <option value="size">Tamaño</option>
            </select>

            <div className="hidden rounded-xl border border-zinc-200 bg-white p-0.5 sm:flex">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  className={`rounded-lg p-1.5 transition ${view === v ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-700"}`}
                  aria-label={v === "grid" ? "Vista cuadrícula" : "Vista lista"}
                  aria-pressed={view === v}
                >
                  {v === "grid" ? <GridIcon /> : <ListIcon />}
                </button>
              ))}
            </div>
            </>
            )}

            <button
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
            >
              <UploadIcon /> <span className="hidden sm:inline">Subir</span>
            </button>
          </div>

          <div className={`px-4 pb-3 md:hidden ${isPanel ? "hidden" : ""}`}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar videos…"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </div>
          </div>
        </header>

        {/* Barra de selección múltiple */}
        {selected.size > 0 && !isPanel && (
          <div className="sticky top-16 z-10 mx-4 mt-4 flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg sm:mx-6">
            <span className="font-medium">{selected.size} seleccionados</span>
            <div className="flex-1" />
            <Menu
              label="Mover selección"
              items={[
                { label: "Sin carpeta", icon: <InboxIcon />, onSelect: () => move([...selected], null) },
                ...folders.map((f) => ({ label: f.name, icon: <FolderIcon />, onSelect: () => move([...selected], f.id) })),
              ]}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white/10">
                  <FolderIcon /> Mover
                </button>
              )}
            />
            <button
              onClick={() =>
                setDialog({
                  kind: "confirm",
                  title: `Eliminar ${selected.size} videos`,
                  message: "Se eliminarán de forma permanente y sus códigos de inserción dejarán de funcionar.",
                  confirmLabel: "Eliminar",
                  danger: true,
                  onConfirm: () => deleteMany([...selected]),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-red-300 hover:bg-white/10"
            >
              <TrashIcon /> Eliminar
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Quitar selección">
              <XIcon />
            </button>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6">
          {filter.kind === "monetization" ? (
            <MonetizationView
              notify={notify}
              isAdmin={user.isAdmin}
              onOpenAdmin={() => changeFilter({ kind: "admin" })}
              confirm={(o) => setDialog({ kind: "confirm", ...o })}
            />
          ) : filter.kind === "admin" && user.isAdmin ? (
            <AdminView notify={notify} openDialog={setDialog} />
          ) : isOverview ? (
            <Overview
              videos={videos}
              stats={stats}
              actions={actions}
              onUpload={() => fileInput.current?.click()}
              refreshing={statsLoading}
            />
          ) : visible.length > 0 ? (
            view === "grid" ? (
              <VideoGrid videos={visible} folders={folders} actions={actions} selected={selected} onToggleSelect={toggleSelect} />
            ) : (
              <VideoList videos={visible} folders={folders} actions={actions} selected={selected} onToggleSelect={toggleSelect} />
            )
          ) : (
            <EmptyState
              kind={query ? "search" : videos.length === 0 ? "first" : "folder"}
              onUpload={() => fileInput.current?.click()}
              maxLabel={`${Math.round(maxBytes / 1024 / 1024)} MB`}
            />
          )}
        </main>

        {fileDrag && (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-brand-600/10 backdrop-blur-[1px] lg:left-64">
            <div className="rounded-2xl border-2 border-dashed border-brand-500 bg-white/95 px-10 py-8 text-center shadow-2xl">
              <UploadIcon className="mx-auto h-8 w-8 text-brand-600" />
              <p className="mt-3 text-sm font-semibold">Suelta para subir</p>
              <p className="mt-1 text-xs text-zinc-500">a «{currentFolder?.name ?? "Sin carpeta"}»</p>
            </div>
          </div>
        )}
      </div>

      <VideoModal video={openVideo} folders={folders} actions={actions} onClose={() => setOpenId(null)} />
      <Dialogs state={dialog} onClose={() => setDialog(null)} />
      <UploadPanel items={uploads.items} onCancel={uploads.cancel} onDismiss={uploads.remove} />

      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center transition-all duration-300 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toast && <div className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}

function EmptyState({ kind, onUpload, maxLabel }: { kind: "first" | "folder" | "search"; onUpload: () => void; maxLabel: string }) {
  if (kind === "search") {
    return <p className="py-24 text-center text-sm text-zinc-500">No hay videos que coincidan con la búsqueda.</p>;
  }
  return (
    <button
      onClick={onUpload}
      className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white px-6 py-16 text-center transition hover:border-brand-400 hover:bg-brand-50/30"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <UploadIcon className="h-6 w-6" />
      </span>
      <p className="mt-5 text-base font-semibold">{kind === "first" ? "Sube tu primer video" : "Esta carpeta está vacía"}</p>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">
        {kind === "first"
          ? "Arrastra archivos aquí o haz clic para elegirlos. Obtendrás al instante un código de inserción."
          : "Arrastra videos desde otra vista hasta esta carpeta en la barra lateral, o sube nuevos aquí."}
      </p>
      <p className="mt-4 text-xs text-zinc-400">MP4, WebM, MOV… · hasta {maxLabel} por archivo</p>
    </button>
  );
}
