/**
 * Estado y acciones compartidas del panel (biblioteca, resumen, monetización,
 * administración). La página `/dashboard` crea el almacén con los datos
 * iniciales y las vistas lo leen con `useDashboard()`.
 */
import type { ComputedRef, InjectionKey, Ref } from "vue";
import type { PublicVideo, PublicVideoStatus } from "#srv/videos/dto";
import type { PublicFolder } from "#srv/videos/service";
import type { DashboardStats } from "#srv/videos/stats";

export type { PublicFolder, PublicVideo, PublicVideoStatus, DashboardStats };

/** Vista actual: resumen, monetización, admin, todos, sin carpeta o una carpeta. */
export type FolderFilter =
  | { kind: "overview" }
  | { kind: "monetization" }
  | { kind: "admin" }
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "folder"; id: string };

export interface VideoActions {
  open: (v: PublicVideo) => void;
  copyIframe: (v: PublicVideo) => void;
  copyLink: (v: PublicVideo) => void;
  rename: (v: PublicVideo) => void;
  move: (ids: string[], folderId: string | null) => void;
  remove: (v: PublicVideo) => void;
  removeMany: (ids: string[]) => void;
  setAllowDownload: (v: PublicVideo, allow: boolean) => void;
}

export interface DashboardUser {
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export interface DashboardInitial {
  user: DashboardUser;
  videos: PublicVideo[];
  folders: PublicFolder[];
  stats: DashboardStats;
  maxBytes: number;
}

export interface DashboardStore {
  user: DashboardUser;
  maxBytes: number;
  videos: Ref<PublicVideo[]>;
  folders: Ref<PublicFolder[]>;
  stats: Ref<DashboardStats>;
  statsLoading: Ref<boolean>;
  filter: ComputedRef<FolderFilter>;
  changeFilter: (f: FolderFilter) => void;
  /** Video abierto en el modal de detalle. */
  openId: Ref<string | null>;
  toast: Ref<string | null>;
  notify: (msg: string) => void;
  errMsg: (err: unknown) => string;
  actions: VideoActions;
  /** Abre el selector de archivos (lo registra la página). */
  openUpload: () => void;
  setUploadOpener: (fn: () => void) => void;
  refreshStats: () => Promise<void>;
  counts: ComputedRef<{ all: number; none: number; byFolder: Map<string, number> }>;
  totalBytes: ComputedRef<number>;
  createFolder: (name: string) => Promise<boolean>;
  renameFolder: (f: PublicFolder) => void;
  deleteFolder: (f: PublicFolder) => void;
}

/** Tipo MIME propio para arrastrar videos hacia carpetas. */
export const DRAG_MIME = "application/x-dembed-videos";

const KEY: InjectionKey<DashboardStore> = Symbol("dashboard");

export function useDashboard(): DashboardStore {
  const store = inject(KEY);
  if (!store) throw new Error("useDashboard() fuera de /dashboard");
  return store;
}

const sortFolders = (list: PublicFolder[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));

export function createDashboard(initial: DashboardInitial): DashboardStore {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const dialogs = useDialogs();

  const videos = ref<PublicVideo[]>(initial.videos);
  const folders = ref<PublicFolder[]>(sortFolders(initial.folders));
  const stats = ref<DashboardStats>(initial.stats);
  const statsLoading = ref(false);
  const openId = ref<string | null>(null);
  const toast = ref<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let uploadOpener: () => void = () => {};

  const notify = (msg: string) => {
    toast.value = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), 2600);
  };
  const errMsg = (err: unknown) => (err as Error)?.message || t("common.requestFailed");

  // La vista vive en la URL (?folder=…), así la cabecera y el historial la comparten.
  const filter = computed<FolderFilter>(() => {
    const folder = typeof route.query.folder === "string" ? route.query.folder : undefined;
    if (folder === "monetization") return { kind: "monetization" };
    if (folder === "admin" && initial.user.isAdmin) return { kind: "admin" };
    if (folder === "all") return { kind: "all" };
    if (folder === "none") return { kind: "none" };
    if (folder && folders.value.some((f) => f.id === folder)) return { kind: "folder", id: folder };
    return { kind: "overview" };
  });
  const changeFilter = (f: FolderFilter) => {
    const query = { ...route.query };
    if (f.kind === "overview") delete query.folder;
    else query.folder = f.kind === "folder" ? f.id : f.kind;
    delete query.upload;
    void router.replace({ query });
  };

  const refreshStats = async () => {
    statsLoading.value = true;
    const data = await api<DashboardStats>("/api/stats").catch(() => null);
    if (data) stats.value = data;
    statsLoading.value = false;
  };

  const counts = computed(() => {
    const byFolder = new Map<string, number>();
    let none = 0;
    for (const v of videos.value) {
      if (v.folderId) byFolder.set(v.folderId, (byFolder.get(v.folderId) ?? 0) + 1);
      else none++;
    }
    return { all: videos.value.length, none, byFolder };
  });
  const totalBytes = computed(() => videos.value.reduce((acc, v) => acc + v.sizeBytes, 0));

  // ---------------------------------------------------------------- acciones
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(t("dashboard.toast.copied", { what }));
    } catch {
      window.prompt(t("dashboard.copyPrompt", { what }), text);
    }
  };

  const move = async (ids: string[], folderId: string | null) => {
    const before = videos.value;
    videos.value = videos.value.map((v) => (ids.includes(v.id) ? { ...v, folderId } : v));
    try {
      await api("/api/videos/move", { method: "POST", body: JSON.stringify({ videoIds: ids, folderId }) });
      const dest = folderId ? folders.value.find((f) => f.id === folderId)?.name : t("dashboard.titles.none");
      notify(t("dashboard.toast.moved", { count: ids.length, dest: dest ?? "" }));
    } catch (err) {
      videos.value = before;
      notify(errMsg(err));
    }
  };

  const deleteMany = async (ids: string[]) => {
    let ok = 0;
    for (const id of ids) {
      try {
        await api(`/api/videos/${id}`, { method: "DELETE" });
        ok++;
        videos.value = videos.value.filter((v) => v.id !== id);
      } catch (err) {
        notify(errMsg(err));
      }
    }
    if (openId.value && ids.includes(openId.value)) openId.value = null;
    if (ok) notify(t("dashboard.toast.deleted", { count: ok }));
  };

  const actions: VideoActions = {
    open: (v) => (openId.value = v.id),
    copyIframe: (v) => copy(v.iframe, t("dashboard.what.iframe")),
    copyLink: (v) => copy(v.watchUrl, t("dashboard.what.link")),
    move,
    rename: (v) =>
      dialogs.prompt({
        title: t("dashboard.dialogs.renameVideo"),
        label: t("dashboard.dialogs.title"),
        initial: v.title,
        confirmLabel: t("common.save"),
        onSubmit: async (title) => {
          try {
            const { video } = await api<{ video: PublicVideo }>(`/api/videos/${v.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
            videos.value = videos.value.map((x) => (x.id === video.id ? video : x));
            return true;
          } catch (err) {
            notify(errMsg(err));
            return false;
          }
        },
      }),
    setAllowDownload: async (v, allow) => {
      videos.value = videos.value.map((x) => (x.id === v.id ? { ...x, allowDownload: allow } : x));
      try {
        await api(`/api/videos/${v.id}`, { method: "PATCH", body: JSON.stringify({ allowDownload: allow }) });
        notify(allow ? t("dashboard.toast.downloadOn") : t("dashboard.toast.downloadOff"));
      } catch (err) {
        videos.value = videos.value.map((x) => (x.id === v.id ? { ...x, allowDownload: !allow } : x));
        notify(errMsg(err));
      }
    },
    remove: (v) =>
      dialogs.confirm({
        title: t("dashboard.dialogs.deleteVideo"),
        message: t("dashboard.dialogs.deleteVideoMsg", { title: v.title }),
        confirmLabel: t("common.delete"),
        danger: true,
        onConfirm: () => deleteMany([v.id]),
      }),
    removeMany: (ids) =>
      dialogs.confirm({
        title: t("dashboard.dialogs.deleteMany", { count: ids.length }),
        message: t("dashboard.dialogs.deleteManyMsg"),
        confirmLabel: t("common.delete"),
        danger: true,
        onConfirm: () => deleteMany(ids),
      }),
  };

  // ---------------------------------------------------------------- carpetas
  const createFolder = async (name: string) => {
    try {
      const { folder } = await api<{ folder: PublicFolder }>("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
      folders.value = sortFolders([...folders.value, folder]);
      changeFilter({ kind: "folder", id: folder.id });
      return true;
    } catch (err) {
      notify(errMsg(err));
      return false;
    }
  };

  const renameFolder = (f: PublicFolder) =>
    dialogs.prompt({
      title: t("dashboard.dialogs.renameFolder"),
      label: t("dashboard.dialogs.name"),
      initial: f.name,
      maxLength: 60,
      confirmLabel: t("common.save"),
      onSubmit: async (name) => {
        try {
          const { folder } = await api<{ folder: PublicFolder }>(`/api/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
          folders.value = sortFolders(folders.value.map((x) => (x.id === folder.id ? folder : x)));
          return true;
        } catch (err) {
          notify(errMsg(err));
          return false;
        }
      },
    });

  const deleteFolder = (f: PublicFolder) =>
    dialogs.confirm({
      title: t("dashboard.dialogs.deleteFolder"),
      message: t("dashboard.dialogs.deleteFolderMsg", { name: f.name, count: counts.value.byFolder.get(f.id) ?? 0 }),
      confirmLabel: t("dashboard.dialogs.deleteFolder"),
      danger: true,
      onConfirm: async () => {
        try {
          await api(`/api/folders/${f.id}`, { method: "DELETE" });
          folders.value = folders.value.filter((x) => x.id !== f.id);
          videos.value = videos.value.map((v) => (v.folderId === f.id ? { ...v, folderId: null } : v));
          if (filter.value.kind === "folder" && filter.value.id === f.id) changeFilter({ kind: "all" });
          notify(t("dashboard.toast.folderDeleted"));
        } catch (err) {
          notify(errMsg(err));
        }
      },
    });

  const store: DashboardStore = {
    user: initial.user,
    maxBytes: initial.maxBytes,
    videos,
    folders,
    stats,
    statsLoading,
    filter,
    changeFilter,
    openId,
    toast,
    notify,
    errMsg,
    actions,
    openUpload: () => uploadOpener(),
    setUploadOpener: (fn) => (uploadOpener = fn),
    refreshStats,
    counts,
    totalBytes,
    createFolder,
    renameFolder,
    deleteFolder,
  };
  provide(KEY, store);
  return store;
}
