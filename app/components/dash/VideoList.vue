<script setup lang="ts">
import { Eye } from "lucide-vue-next";
import { DRAG_MIME, type PublicVideo } from "~/composables/useDashboard";

const props = defineProps<{ videos: PublicVideo[]; selected: Set<string> }>();
const emit = defineEmits<{ toggle: [id: string, range: boolean] }>();
const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const folderName = (id: string | null) => d.folders.value.find((f) => f.id === id)?.name ?? "—";

function dragStart(e: DragEvent, v: PublicVideo) {
  const ids = props.selected.has(v.id) ? [...props.selected] : [v.id];
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(ids));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <div class="rounded-2xl bg-raised shadow-card">
    <div class="hidden grid-cols-[minmax(0,1fr)_120px_90px_90px_120px_120px_40px] items-center gap-4 border-b border-divider px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary md:grid">
      <span>{{ t("video.columns.video") }}</span>
      <span>{{ t("video.columns.status") }}</span>
      <span class="inline-flex items-center gap-1"><Eye class="h-3.5 w-3.5" /></span>
      <span>{{ t("video.columns.size") }}</span>
      <span>{{ t("video.columns.folder") }}</span>
      <span>{{ t("video.columns.uploaded") }}</span>
      <span />
    </div>
    <ul class="divide-y divide-divider">
      <li
        v-for="v in videos"
        :key="v.id"
        draggable="true"
        :class="[
          'group grid grid-cols-[minmax(0,1fr)_40px] items-center gap-4 px-4 py-3 transition first:rounded-t-2xl last:rounded-b-2xl has-[[role=menu]]:relative has-[[role=menu]]:z-20 md:grid-cols-[minmax(0,1fr)_120px_90px_90px_120px_120px_40px]',
          selected.has(v.id) ? 'bg-brand-soft' : 'hover:bg-bg-soft',
        ]"
        @dragstart="dragStart($event, v)"
      >
        <div class="flex min-w-0 items-center gap-3">
          <DashSelectBox light class="shrink-0" :checked="selected.has(v.id)" @toggle="(range) => emit('toggle', v.id, range)" />
          <button class="w-28 shrink-0 overflow-hidden rounded-xl" :aria-label="t('video.openTitle', { title: v.title })" @click="d.actions.open(v)">
            <DashVideoThumb :video="v" size="sm" />
          </button>
          <button class="min-w-0 text-left" @click="d.actions.open(v)">
            <p class="truncate font-bold text-contrast">{{ v.title }}</p>
            <p class="text-sm text-secondary md:hidden">{{ fmt.formatBytes(v.sizeBytes) }} · {{ fmt.formatRelative(v.createdAt) }}</p>
          </button>
        </div>
        <div class="hidden md:block"><DashStatusBadge :status="v.status" /></div>
        <span class="hidden text-sm font-semibold tabular-nums text-primary md:block">{{ fmt.formatCount(v.views) }}</span>
        <span class="hidden text-sm tabular-nums text-primary md:block">{{ fmt.formatBytes(v.sizeBytes) }}</span>
        <span class="hidden truncate text-sm text-primary md:block">{{ folderName(v.folderId) }}</span>
        <span class="hidden text-sm text-primary md:block">{{ fmt.formatRelative(v.createdAt) }}</span>
        <DashVideoMenuButton :video="v" />
      </li>
    </ul>
  </div>
</template>
