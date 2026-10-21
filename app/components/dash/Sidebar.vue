<script setup lang="ts">
/** Barra lateral del panel: secciones, biblioteca, carpetas y almacenamiento. */
import { ChartNoAxesColumn, CircleDollarSign, Ellipsis, Folder, FolderPlus, HardDrive, Inbox, Library, Pencil, ShieldCheck, Trash2, Upload } from "lucide-vue-next";
import type { FolderFilter } from "~/composables/useDashboard";

const emit = defineEmits<{ navigate: [] }>();
const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const creating = ref(false);
const name = ref("");

const isActive = (f: FolderFilter) => {
  const cur = d.filter.value;
  return f.kind === cur.kind && (f.kind !== "folder" || (cur.kind === "folder" && cur.id === f.id));
};
const go = (f: FolderFilter) => {
  d.changeFilter(f);
  emit("navigate");
};
async function submit() {
  if (!name.value.trim()) return (creating.value = false);
  if (await d.createFolder(name.value.trim())) {
    name.value = "";
    creating.value = false;
    emit("navigate");
  }
}
const quotaBytes = computed(() => d.stats.value.quotaBytes);
const pct = computed(() => (quotaBytes.value ? Math.min(100, (d.totalBytes.value / quotaBytes.value) * 100) : 0));
</script>

<template>
  <div class="space-y-4">
    <UiButton color="brand" block size="lg" @click="d.openUpload()"><Upload />{{ t("sidebar.upload") }}</UiButton>

    <nav :aria-label="t('dashboard.menu')" class="rounded-2xl bg-raised p-2 shadow-card">
      <DashNavItem :icon="ChartNoAxesColumn" :label="t('sidebar.overview')" :active="isActive({ kind: 'overview' })" @select="go({ kind: 'overview' })" />
      <DashNavItem :icon="CircleDollarSign" :label="t('sidebar.monetization')" :active="isActive({ kind: 'monetization' })" @select="go({ kind: 'monetization' })" />
      <DashNavItem v-if="d.user.isAdmin" :icon="ShieldCheck" :label="t('sidebar.admin')" :active="isActive({ kind: 'admin' })" @select="go({ kind: 'admin' })" />

      <p class="px-3 pb-1.5 pt-4 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("sidebar.library") }}</p>
      <DashNavItem :icon="Library" :label="t('sidebar.allVideos')" :count="d.counts.value.all" :active="isActive({ kind: 'all' })" @select="go({ kind: 'all' })" />
      <DashNavItem
        :icon="Inbox"
        :label="t('sidebar.noFolder')"
        :count="d.counts.value.none"
        :active="isActive({ kind: 'none' })"
        droppable
        @select="go({ kind: 'none' })"
        @drop-videos="(ids) => d.actions.move(ids, null)"
      />

      <div class="flex items-center justify-between pb-1.5 pl-3 pr-1 pt-4">
        <p class="text-xs font-bold uppercase tracking-wide text-secondary">{{ t("sidebar.folders") }}</p>
        <UiButton color="transparent" size="sm" icon-only :aria-label="t('sidebar.newFolder')" :title="t('sidebar.newFolder')" class="!h-7 !w-7 [&_svg]:!h-4 [&_svg]:!w-4" @click="creating = true">
          <FolderPlus />
        </UiButton>
      </div>
      <form v-if="creating" class="mb-1 px-1" @submit.prevent="submit">
        <input
          v-model="name"
          autofocus
          maxlength="60"
          :placeholder="t('sidebar.folderName')"
          class="input"
          @blur="submit"
          @keydown.esc="((name = ''), (creating = false))"
        />
      </form>
      <DashNavItem
        v-for="f in d.folders.value"
        :key="f.id"
        :icon="Folder"
        :label="f.name"
        :count="d.counts.value.byFolder.get(f.id) ?? 0"
        :active="isActive({ kind: 'folder', id: f.id })"
        droppable
        @select="go({ kind: 'folder', id: f.id })"
        @drop-videos="(ids) => d.actions.move(ids, f.id)"
      >
        <template #menu>
          <UiMenu
            :label="t('sidebar.folderOptions')"
            width="w-52"
            :items="[
              { label: t('sidebar.rename'), icon: Pencil, onSelect: () => d.renameFolder(f) },
              { label: t('sidebar.deleteFolder'), icon: Trash2, onSelect: () => d.deleteFolder(f), danger: true },
            ]"
          >
            <template #trigger="{ toggle }">
              <UiButton color="transparent" size="sm" icon-only :aria-label="t('sidebar.options')" class="!h-7 !w-7 [&_svg]:!h-4 [&_svg]:!w-4" @click="toggle"><Ellipsis /></UiButton>
            </template>
          </UiMenu>
        </template>
      </DashNavItem>
      <button
        v-if="!d.folders.value.length && !creating"
        type="button"
        class="mt-1 w-full rounded-xl border-2 border-dashed border-divider px-3 py-3 text-sm font-semibold text-secondary transition hover:border-brand hover:text-contrast"
        @click="creating = true"
      >
        {{ t("sidebar.emptyFolders") }}
      </button>
    </nav>

    <section class="rounded-2xl bg-raised p-4 shadow-card">
      <p class="flex items-center gap-2 text-sm font-bold text-secondary"><HardDrive class="h-4 w-4" />{{ t("sidebar.storage") }}</p>
      <p class="mt-2 text-lg font-extrabold text-contrast">
        {{ fmt.formatBytes(d.totalBytes.value) }}
        <span v-if="quotaBytes" class="text-sm font-semibold text-secondary">/ {{ fmt.formatBytes(quotaBytes) }}</span>
      </p>
      <div v-if="quotaBytes" class="mt-2 h-2 overflow-hidden rounded-full bg-button">
        <div :class="['h-full rounded-full', pct > 90 ? 'bg-red' : pct > 75 ? 'bg-orange' : 'bg-brand']" :style="{ width: `${pct}%` }" />
      </div>
      <p class="mt-1.5 text-sm text-secondary">{{ t("sidebar.videoCount", { count: d.counts.value.all }) }}</p>
    </section>
  </div>
</template>
