<script setup lang="ts">
/** /dashboard — panel del usuario (requiere sesión; lo protege el middleware del servidor). */
import { ChartNoAxesColumn, CircleDollarSign, Folder, Inbox, Library, Menu as MenuIcon, ShieldCheck, Upload, X } from "lucide-vue-next";
import { DRAG_MIME, createDashboard, type DashboardInitial, type PublicVideo } from "~/composables/useDashboard";

const { t } = useI18n();
const route = useRoute();
const { data, error } = await useFetch<DashboardInitial>("/api/dashboard", { key: "dashboard" });
if (error.value?.statusCode === 401) await navigateTo(`/login?next=${encodeURIComponent(route.fullPath)}`, { replace: true });
if (!data.value) throw createError({ statusCode: error.value?.statusCode ?? 500, fatal: true });

const d = createDashboard(data.value);
useHead(() => ({ title: t("dashboard.metaTitle") }));

// ------------------------------------------------------------------ subidas
const fileInput = ref<HTMLInputElement>();
const currentFolderId = computed(() => (d.filter.value.kind === "folder" ? d.filter.value.id : null));
const uploads = useUploads(d.maxBytes, (video: PublicVideo) => {
  d.videos.value = [video, ...d.videos.value.filter((v) => v.id !== video.id)];
});
d.setUploadOpener(() => fileInput.value?.click());
function onFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) uploads.add(input.files, currentFolderId.value);
  input.value = "";
}
// El botón «Subir videos» de la cabecera llega con ?upload=1.
watch(
  () => route.query.upload,
  (v) => {
    if (v !== "1" || !import.meta.client) return;
    nextTick(() => fileInput.value?.click());
    const query = { ...route.query };
    delete query.upload;
    void navigateTo({ query }, { replace: true });
  },
  { immediate: true },
);

// ------------------------------------------------------------------ sondeo de videos en proceso
const hasPending = computed(() => d.videos.value.some((v) => v.status === "processing" || v.status === "uploading"));
let poll: ReturnType<typeof setInterval> | undefined;
watch(
  hasPending,
  (pending) => {
    clearInterval(poll);
    if (!pending || !import.meta.client) return;
    poll = setInterval(async () => {
      const res = await api<{ videos: PublicVideo[] }>("/api/videos").catch(() => null);
      if (res) d.videos.value = res.videos;
    }, 5000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(poll));

// ------------------------------------------------------------------ arrastrar archivos
const fileDrag = ref(false);
const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files") && !e.dataTransfer.types.includes(DRAG_MIME);
function onDragOver(e: DragEvent) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  fileDrag.value = true;
}
function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) fileDrag.value = false;
}
function onDrop(e: DragEvent) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  fileDrag.value = false;
  uploads.add(e.dataTransfer!.files, currentFolderId.value);
}

// ------------------------------------------------------------------ cabecera de la sección
const drawer = ref(false);
const currentFolder = computed(() => d.folders.value.find((f) => f.id === currentFolderId.value));
const isPanel = computed(() => ["overview", "monetization", "admin"].includes(d.filter.value.kind));
const title = computed(() => (d.filter.value.kind === "folder" ? (currentFolder.value?.name ?? "") : t.dynamic(`dashboard.titles.${d.filter.value.kind}`)));
const libraryCount = computed(() => {
  const f = d.filter.value;
  if (f.kind === "all") return d.counts.value.all;
  if (f.kind === "none") return d.counts.value.none;
  if (f.kind === "folder") return d.counts.value.byFolder.get(f.id) ?? 0;
  return 0;
});
const icon = computed(
  () => ({ overview: ChartNoAxesColumn, monetization: CircleDollarSign, admin: ShieldCheck, all: Library, none: Inbox, folder: Folder })[d.filter.value.kind],
);
</script>

<template>
  <div class="relative" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <input ref="fileInput" type="file" accept="video/*" multiple hidden @change="onFiles" />

    <div class="mx-auto grid max-w-[1280px] grid-cols-1 gap-5 px-4 pb-16 pt-2 sm:px-6 lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside class="hidden lg:block">
        <div class="sticky top-4"><DashSidebar /></div>
      </aside>

      <div class="min-w-0">
        <div class="mb-5 flex flex-wrap items-center gap-3">
          <UiButton color="standard" icon-only class="lg:hidden" :aria-label="t('dashboard.menu')" @click="drawer = true"><MenuIcon /></UiButton>
          <span class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-raised text-brand shadow-card sm:flex"><component :is="icon" class="h-6 w-6" /></span>
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-2xl font-extrabold text-contrast sm:text-3xl">{{ title }}</h1>
            <p class="text-sm font-semibold text-secondary">
              {{ isPanel ? t.dynamic(`dashboard.subtitles.${d.filter.value.kind}`) : t("dashboard.videoCount", { count: libraryCount }) }}
            </p>
          </div>
          <UiButton v-if="!isPanel" color="brand" class="lg:hidden" @click="d.openUpload()"><Upload />{{ t("dashboard.upload") }}</UiButton>
        </div>

        <DashMonetizationView v-if="d.filter.value.kind === 'monetization'" />
        <DashAdminView v-else-if="d.filter.value.kind === 'admin'" />
        <DashOverview v-else-if="d.filter.value.kind === 'overview'" />
        <DashLibrary v-else />
      </div>
    </div>

    <!-- Barra lateral en móvil -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
        <div v-if="drawer" class="fixed inset-0 z-50 lg:hidden">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="drawer = false" />
          <aside class="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-bg p-4 shadow-floating">
            <div class="mb-4 flex items-center justify-between">
              <SiteLogo />
              <UiButton color="transparent" icon-only :aria-label="t('common.close')" @click="drawer = false"><X /></UiButton>
            </div>
            <DashSidebar @navigate="drawer = false" />
          </aside>
        </div>
      </Transition>
    </Teleport>

    <div v-if="fileDrag" class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-soft backdrop-blur-[2px]">
      <div class="rounded-3xl border-2 border-dashed border-brand bg-raised px-12 py-10 text-center shadow-floating">
        <Upload class="mx-auto h-10 w-10 text-brand" />
        <p class="mt-3 text-lg font-extrabold text-contrast">{{ t("dashboard.dropHere") }}</p>
        <p class="mt-1 text-sm text-secondary">{{ t("dashboard.dropTo", { folder: currentFolder?.name ?? t("dashboard.titles.none") }) }}</p>
      </div>
    </div>

    <DashVideoModal />
    <UiDialogHost />
    <DashUploadPanel :items="uploads.items.value" @cancel="uploads.cancel" @dismiss="uploads.remove" />

    <div aria-live="polite" :class="['pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center transition-all duration-300', d.toast.value ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0']">
      <div v-if="d.toast.value" class="rounded-full border border-divider bg-raised px-5 py-2.5 text-sm font-bold text-contrast shadow-floating">{{ d.toast.value }}</div>
    </div>
  </div>
</template>
