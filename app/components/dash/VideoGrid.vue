<script setup lang="ts">
import { Download, Eye, Folder } from "lucide-vue-next";
import { DRAG_MIME, type PublicVideo } from "~/composables/useDashboard";

const props = defineProps<{ videos: PublicVideo[]; selected: Set<string> }>();
const emit = defineEmits<{ toggle: [id: string, range: boolean] }>();
const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const selecting = computed(() => props.selected.size > 0);
const folderName = (id: string | null) => d.folders.value.find((f) => f.id === id)?.name;

/** Arrastrar: si el video está seleccionado se arrastra toda la selección. */
function dragStart(e: DragEvent, v: PublicVideo) {
  const ids = props.selected.has(v.id) ? [...props.selected] : [v.id];
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(ids));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <li
      v-for="v in videos"
      :key="v.id"
      draggable="true"
      :class="[
        'group relative min-w-0 rounded-2xl bg-raised shadow-card transition duration-200 has-[[role=menu]]:z-20 hover:-translate-y-0.5',
        selected.has(v.id) ? 'ring-2 ring-brand' : '',
      ]"
      @dragstart="dragStart($event, v)"
    >
      <button class="block w-full overflow-hidden rounded-t-2xl text-left" :aria-label="t('video.openTitle', { title: v.title })" @click="selecting ? emit('toggle', v.id, false) : d.actions.open(v)">
        <DashVideoThumb :video="v" />
      </button>
      <DashSelectBox
        :checked="selected.has(v.id)"
        :class="['absolute left-3 top-3', selected.has(v.id) || selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100']"
        @toggle="(range) => emit('toggle', v.id, range)"
      />
      <div class="flex items-start gap-1 p-4">
        <div class="min-w-0 flex-1">
          <button type="button" class="block max-w-full truncate text-left text-base font-extrabold text-contrast hover:underline" :title="v.title" @click="selecting ? emit('toggle', v.id, false) : d.actions.open(v)">{{ v.title }}</button>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-secondary">
            <template v-if="v.status === 'ready'">
              <span class="inline-flex items-center gap-1" :title="t('video.views', { count: v.views, formatted: fmt.formatCount(v.views) })"><Eye class="h-4 w-4" />{{ fmt.formatCount(v.views) }}</span>
              <span v-if="v.downloads" class="inline-flex items-center gap-1"><Download class="h-4 w-4" />{{ fmt.formatCount(v.downloads) }}</span>
            </template>
            <DashStatusBadge v-else :status="v.status" />
            <span class="truncate font-medium">{{ fmt.formatRelative(v.createdAt) }}</span>
          </div>
          <span v-if="folderName(v.folderId)" class="mt-2.5 inline-flex max-w-full items-center gap-1 rounded-full bg-button px-2.5 py-0.5 text-xs font-bold text-primary">
            <Folder class="h-3 w-3 shrink-0" /><span class="truncate">{{ folderName(v.folderId) }}</span>
          </span>
        </div>
        <DashVideoMenuButton :video="v" />
      </div>
    </li>
  </ul>
</template>
