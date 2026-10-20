"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  // El servidor devuelve el mensaje ya traducido; sin él, el componente usa uno genérico.
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "");
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
  footer,
}: {
  user: { email: string; name: string | null; isAdmin: boolean };
  initialVideos: PublicVideo[];
  initialFolders: PublicFolder[];
  initialFilter: FolderFilter;
  initialStats: DashboardStats;
  maxBytes: number;
  /** Footer legal renderizado en el servidor. */
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const errMsg = (err: unknown) => (err as Error).message || tc("requestFailed");
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
    filter.kind === "folder" ? (currentFolder?.name ?? "") : t(`titles.${filter.kind}`);

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
        notify(t("toast.copied", { what }));
      } catch {
        window.prompt(t("copyPrompt", { what }), text);
      }
    },
    [notify, t],
  );

  const move = useCallback(
    async (ids: string[], folderId: string | null) => {
      const before = videos;
      setVideos((prev) => prev.map((v) => (ids.includes(v.id) ? { ...v, folderId } : v)));
      setSelected(new Set());
      try {
        await api("/api/videos/move", { method: "POST", body: JSON.stringify({ videoIds: ids, folderId }) });
        const dest = folderId ? folders.find((f) => f.id === folderId)?.name : t("titles.none");
        notify(t("toast.moved", { count: ids.length, dest: dest ?? "" }));
      } catch (err) {
        setVideos(before);
        notify(errMsg(err));
      }
    },
    [videos, folders, notify, t, tc],
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
          notify(errMsg(err));
        }
      }
      setSelected(new Set());
      setOpenId((cur) => (cur && ids.includes(cur) ? null : cur));
      if (ok) notify(t("toast.deleted", { count: ok }));
    },
    [notify, t, tc],
  );

  const actions: VideoActions = useMemo(
    () => ({
      open: (v) => setOpenId(v.id),
      copyIframe: (v) => copy(v.iframe, t("what.iframe")),
      copyLink: (v) => copy(v.watchUrl, t("what.link")),
      move,
      rename: (v) =>
        setDialog({
          kind: "prompt",
          title: t("dialogs.renameVideo"),
          label: t("dialogs.title"),
          initial: v.title,
          confirmLabel: tc("save"),
          onSubmit: async (title) => {
            try {
              const { video } = await api<{ video: PublicVideo }>(`/api/videos/${v.id}`, {
                method: "PATCH",
                body: JSON.stringify({ title }),
              });
              setVideos((prev) => prev.map((x) => (x.id === video.id ? video : x)));
              return true;
            } catch (err) {
              notify(errMsg(err));
              return false;
            }
          },
        }),
      setAllowDownload: async (v, allow) => {
        setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, allowDownload: allow } : x)));
        try {
          await api(`/api/videos/${v.id}`, { method: "PATCH", body: JSON.stringify({ allowDownload: allow }) });
          notify(allow ? t("toast.downloadOn") : t("toast.downloadOff"));
        } catch (err) {
          setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, allowDownload: !allow } : x)));
          notify(errMsg(err));
        }
      },
      remove: (v) =>
        setDialog({
          kind: "confirm",
          title: t("dialogs.deleteVideo"),
          message: t("dialogs.deleteVideoMsg", { title: v.title }),
          confirmLabel: tc("delete"),
          danger: true,
          onConfirm: () => deleteMany([v.id]),
        }),
    }),
    [copy, move, deleteMany, notify, t, tc],
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
      notify(errMsg(err));
      return false;
    }
  };

  const renameFolder = (f: PublicFolder) =>
    setDialog({
      kind: "prompt",
      title: t("dialogs.renameFolder"),
      label: t("dialogs.name"),
      initial: f.name,
      maxLength: 60,
      confirmLabel: tc("save"),
      onSubmit: async (name) => {
        try {
          const { folder } = await api<{ folder: PublicFolder }>(`/api/folders/${f.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
          });
          setFolders((prev) => prev.map((x) => (x.id === folder.id ? folder : x)).sort((a, b) => a.name.localeCompare(b.name, "es")));
          return true;
        } catch (err) {
          notify(errMsg(err));
          return false;
        }
      },
    });

  const deleteFolder = (f: PublicFolder) =>
    setDialog({
      kind: "confirm",
      title: t("dialogs.deleteFolder"),
      message: t("dialogs.deleteFolderMsg", { name: f.name, count: counts.byFolder.get(f.id) ?? 0 }),
      confirmLabel: t("dialogs.deleteFolder"),
      danger: true,
      onConfirm: async () => {
        try {
          await api(`/api/folders/${f.id}`, { method: "DELETE" });
          setFolders((prev) => prev.filter((x) => x.id !== f.id));
          setVideos((prev) => prev.map((v) => (v.folderId === f.id ? { ...v, folderId: null } : v)));
          notify(t("toast.folderDeleted"));
        } catch (err) {
          notify(errMsg(err));
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
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden" aria-label={t("menu")}>
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
                {isPanel
                  ? t(`subtitles.${filter.kind as "overview" | "monetization" | "admin"}`)
                  : t("videoCount", { count: visible.length })}
              </p>
            </div>

            {!isPanel && (
            <>
            <div className="relative hidden md:block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                className="w-64 rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="hidden rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none sm:block"
              aria-label={t("sort.label")}
            >
              <option value="new">{t("sort.new")}</option>
              <option value="old">{t("sort.old")}</option>
              <option value="name">{t("sort.name")}</option>
              <option value="size">{t("sort.size")}</option>
            </select>

            <div className="hidden rounded-xl border border-zinc-200 bg-white p-0.5 sm:flex">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  className={`rounded-lg p-1.5 transition ${view === v ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-700"}`}
                  aria-label={v === "grid" ? t("viewGrid") : t("viewList")}
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
              <UploadIcon /> <span className="hidden sm:inline">{t("upload")}</span>
            </button>
          </div>

          <div className={`px-4 pb-3 md:hidden ${isPanel ? "hidden" : ""}`}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </div>
          </div>
        </header>

        {/* Barra de selección múltiple */}
        {selected.size > 0 && !isPanel && (
          <div className="sticky top-16 z-10 mx-4 mt-4 flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg sm:mx-6">
            <span className="font-medium">{t("selected", { count: selected.size })}</span>
            <div className="flex-1" />
            <Menu
              label={t("moveSelection")}
              items={[
                { label: t("titles.none"), icon: <InboxIcon />, onSelect: () => move([...selected], null) },
                ...folders.map((f) => ({ label: f.name, icon: <FolderIcon />, onSelect: () => move([...selected], f.id) })),
              ]}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white/10">
                  <FolderIcon /> {t("move")}
                </button>
              )}
            />
            <button
              onClick={() =>
                setDialog({
                  kind: "confirm",
                  title: t("dialogs.deleteMany", { count: selected.size }),
                  message: t("dialogs.deleteManyMsg"),
                  confirmLabel: tc("delete"),
                  danger: true,
                  onConfirm: () => deleteMany([...selected]),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-red-300 hover:bg-white/10"
            >
              <TrashIcon /> {tc("delete")}
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("clearSelection")}>
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
        {footer}

        {fileDrag && (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-brand-600/10 backdrop-blur-[1px] lg:left-64">
            <div className="rounded-2xl border-2 border-dashed border-brand-500 bg-white/95 px-10 py-8 text-center shadow-2xl">
              <UploadIcon className="mx-auto h-8 w-8 text-brand-600" />
              <p className="mt-3 text-sm font-semibold">{t("dropHere")}</p>
              <p className="mt-1 text-xs text-zinc-500">{t("dropTo", { folder: currentFolder?.name ?? t("titles.none") })}</p>
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
  const t = useTranslations("dashboard.empty");
  if (kind === "search") {
    return <p className="py-24 text-center text-sm text-zinc-500">{t("search")}</p>;
  }
  return (
    <button
      onClick={onUpload}
      className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white px-6 py-16 text-center transition hover:border-brand-400 hover:bg-brand-50/30"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <UploadIcon className="h-6 w-6" />
      </span>
      <p className="mt-5 text-base font-semibold">{kind === "first" ? t("firstTitle") : t("folderTitle")}</p>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">
        {kind === "first" ? t("firstText") : t("folderText")}
      </p>
      <p className="mt-4 text-xs text-zinc-400">{t("formats", { max: maxLabel })}</p>
    </button>
  );
}
