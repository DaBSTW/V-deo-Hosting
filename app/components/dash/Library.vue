<script setup lang="ts">
/** Biblioteca: búsqueda, orden, cuadrícula/lista, selección múltiple y estado vacío. */
import { ArrowDownUp, Folder, Inbox, LayoutGrid, List, Search, Trash2, Upload, X } from "lucide-vue-next";
import type { MenuEntry } from "~/types/ui";
import type { PublicVideo } from "~/composables/useDashboard";

type View = "grid" | "list";
type Sort = "new" | "old" | "name" | "size";

const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const view = ref<View>("grid");
const sort = ref<Sort>("new");
const query = ref("");
const selected = ref(new Set<string>());
let lastSelected: string | null = null;

onMounted(() => {
  try {
    const saved = localStorage.getItem("dash:view");
    if (saved === "grid" || saved === "list") view.value = saved;
  } catch {}
});
watch(view, (v) => {
  try {
    localStorage.setItem("dash:view", v);
  } catch {}
});
// Al cambiar de carpeta se limpia la selección.
watch(d.filter, () => (selected.value = new Set()));

const visible = computed(() => {
  const f = d.filter.value;
  const q = query.value.trim().toLowerCase();
  const list = d.videos.value.filter(
    (v) => (f.kind === "all" || (f.kind === "none" ? !v.folderId : f.kind === "folder" && v.folderId === f.id)) && (!q || v.title.toLowerCase().includes(q)),
  );
  const cmp: Record<Sort, (a: PublicVideo, b: PublicVideo) => number> = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    old: (a, b) => a.createdAt.localeCompare(b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title, "es", { numeric: true }),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
  };
  return list.sort(cmp[sort.value]);
});

function toggle(id: string, range: boolean) {
  const next = new Set(selected.value);
  if (range && lastSelected) {
    const ids = visible.value.map((v) => v.id);
    const [a, b] = [ids.indexOf(lastSelected), ids.indexOf(id)].sort((x, y) => x - y);
    if (a >= 0) ids.slice(a, b + 1).forEach((x) => next.add(x));
  } else if (next.has(id)) next.delete(id);
  else next.add(id);
  lastSelected = id;
  selected.value = next;
}

const moveSelection = (folderId: string | null) => {
  d.actions.move([...selected.value], folderId);
  selected.value = new Set();
};
const moveItems = computed<MenuEntry[]>(() => [
  { label: t("dashboard.titles.none"), icon: Inbox, onSelect: () => moveSelection(null) },
  ...d.folders.value.map((f) => ({ label: f.name, icon: Folder, onSelect: () => moveSelection(f.id) })),
]);
const deleteSelection = () => {
  d.actions.removeMany([...selected.value]);
  selected.value = new Set();
};

const emptyKind = computed(() => (query.value ? "search" : d.videos.value.length === 0 ? "first" : "folder"));
const sortOptions: Sort[] = ["new", "old", "name", "size"];
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <label class="relative min-w-0 flex-1 basis-56">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-secondary" />
        <input v-model="query" type="search" :placeholder="t('dashboard.search')" :aria-label="t('dashboard.search')" class="input !h-10 !pl-10" />
      </label>
      <label class="relative">
        <ArrowDownUp class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
        <select v-model="sort" :aria-label="t('dashboard.sort.label')" class="hover-bright h-10 cursor-pointer appearance-none rounded-xl bg-button pl-9 pr-4 text-sm font-semibold text-contrast outline-none">
          <option v-for="s in sortOptions" :key="s" :value="s">{{ t.dynamic(`dashboard.sort.${s}`) }}</option>
        </select>
      </label>
      <div class="flex gap-1 rounded-xl bg-button p-1" role="radiogroup" :aria-label="t('dashboard.viewGrid')">
        <button
          v-for="v in ['grid', 'list'] as const"
          :key="v"
          type="button"
          role="radio"
          :aria-checked="view === v"
          :aria-label="v === 'grid' ? t('dashboard.viewGrid') : t('dashboard.viewList')"
          :class="['rounded-lg p-1.5 transition', view === v ? 'bg-brand-highlight text-brand' : 'text-secondary hover:text-contrast']"
          @click="view = v"
        >
          <LayoutGrid v-if="v === 'grid'" class="h-5 w-5" />
          <List v-else class="h-5 w-5" />
        </button>
      </div>
    </div>

    <template v-if="visible.length">
      <DashVideoGrid v-if="view === 'grid'" :videos="visible" :selected="selected" @toggle="toggle" />
      <DashVideoList v-else :videos="visible" :selected="selected" @toggle="toggle" />
    </template>
    <div v-else-if="emptyKind === 'search'" class="rounded-2xl bg-raised py-20 text-center text-secondary">{{ t("dashboard.empty.search") }}</div>
    <button
      v-else
      type="button"
      class="group flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-divider bg-raised px-6 py-16 text-center transition hover:border-brand"
      @click="d.openUpload()"
    >
      <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-highlight text-brand transition group-hover:scale-105"><Upload class="h-7 w-7" /></span>
      <p class="mt-5 text-xl font-extrabold text-contrast">{{ emptyKind === "first" ? t("dashboard.empty.firstTitle") : t("dashboard.empty.folderTitle") }}</p>
      <p class="mt-2 max-w-md text-secondary">{{ emptyKind === "first" ? t("dashboard.empty.firstText") : t("dashboard.empty.folderText") }}</p>
      <p class="mt-4 text-sm font-semibold text-secondary">{{ t("dashboard.empty.formats", { max: fmt.formatBytes(d.maxBytes) }) }}</p>
    </button>

    <!-- Barra flotante de selección múltiple -->
    <Transition enter-active-class="transition duration-200" enter-from-class="translate-y-4 opacity-0" leave-active-class="transition duration-150" leave-to-class="translate-y-4 opacity-0">
      <div v-if="selected.size" class="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <div class="flex max-w-full items-center gap-1.5 rounded-2xl border border-divider bg-raised p-1.5 pl-4 shadow-floating">
          <span class="mr-2 whitespace-nowrap text-sm font-extrabold text-contrast">{{ t("dashboard.selected", { count: selected.size }) }}</span>
          <UiMenu :items="moveItems" :label="t('dashboard.moveSelection')" up align="left">
            <template #trigger="{ toggle: open }">
              <UiButton size="sm" @click="open"><Folder />{{ t("dashboard.move") }}</UiButton>
            </template>
          </UiMenu>
          <UiButton size="sm" color="red" @click="deleteSelection"><Trash2 /><span class="hidden sm:inline">{{ t("common.delete") }}</span></UiButton>
          <UiButton size="sm" color="transparent" icon-only :aria-label="t('dashboard.clearSelection')" @click="selected = new Set()"><X /></UiButton>
        </div>
      </div>
    </Transition>
  </div>
</template>
