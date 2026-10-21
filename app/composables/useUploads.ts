import { UploadAbortedError, UploadError, uploadVideo } from "~/lib/upload-client";
import type { PublicVideo } from "~/composables/useDashboard";

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
const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;

/** Cola de subidas (máx. 2 en paralelo), independiente de la vista. */
export function useUploads(maxBytes: number, onUploaded: (video: PublicVideo) => void) {
  const { t } = useI18n();
  const fmt = useFormat();
  const items = ref<UploadItem[]>([]);
  const running = new Set<string>();

  const patch = (key: string, p: Partial<UploadItem>) => {
    items.value = items.value.map((i) => (i.key === key ? { ...i, ...p } : i));
  };
  const remove = (key: string) => {
    const item = items.value.find((i) => i.key === key);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    items.value = items.value.filter((i) => i.key !== key);
  };

  const add = (files: FileList | File[], folderId: string | null) => {
    const next = Array.from(files).map<UploadItem>((file) => {
      const base = { key: crypto.randomUUID(), file, folderId, title: titleFromFile(file.name), progress: 0, controller: new AbortController() };
      if (file.type && !file.type.startsWith("video/")) return { ...base, status: "error", error: t("upload.errors.notVideo") };
      if (file.size > maxBytes) return { ...base, status: "error", error: t("upload.errors.tooLarge", { max: fmt.formatBytes(maxBytes) }) };
      return { ...base, status: "queued" };
    });
    items.value = [...items.value, ...next];
  };

  const cancel = (item: UploadItem) => {
    if (item.status === "queued") patch(item.key, { status: "canceled" });
    else item.controller.abort();
  };

  const run = (item: UploadItem) => {
    running.add(item.key);
    patch(item.key, { status: "uploading" });
    void (async () => {
      try {
        const video = await uploadVideo(item.file, item.title, item.folderId, {
          signal: item.controller.signal,
          onProgress: (f) => patch(item.key, { progress: f }),
          onPreview: (url) => patch(item.key, { previewUrl: url }),
        });
        running.delete(item.key);
        patch(item.key, { status: "done", progress: 1 });
        onUploaded(video);
        setTimeout(() => remove(item.key), 4000);
      } catch (err) {
        running.delete(item.key);
        patch(
          item.key,
          err instanceof UploadAbortedError
            ? { status: "canceled" }
            : { status: "error", error: err instanceof UploadError ? t.dynamic(`upload.errors.${err.code}`, err.values) : (err as Error).message },
        );
      }
    })();
  };

  // Arranca las que quepan cada vez que cambia la cola.
  watch(
    items,
    (list) => {
      const free = MAX_PARALLEL - running.size;
      list.filter((i) => i.status === "queued" && !running.has(i.key)).slice(0, Math.max(0, free)).forEach(run);
    },
    { deep: false },
  );

  // Evita cerrar la pestaña con subidas en curso.
  const busy = computed(() => items.value.some((i) => i.status === "uploading" || i.status === "queued"));
  const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
  watch(busy, (b) => (b ? window.addEventListener("beforeunload", onBeforeUnload) : window.removeEventListener("beforeunload", onBeforeUnload)));
  onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));

  return { items, add, cancel, remove, busy };
}
