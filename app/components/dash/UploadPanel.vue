<script setup lang="ts">
/** Panel flotante de progreso (estilo gestor de descargas). */
import { Check, ChevronDown, Film, X } from "lucide-vue-next";
import type { UploadItem } from "~/composables/useUploads";

const props = defineProps<{ items: UploadItem[] }>();
const emit = defineEmits<{ cancel: [UploadItem]; dismiss: [string] }>();
const { t } = useI18n();
const fmt = useFormat();
const collapsed = ref(false);
const active = computed(() => props.items.filter((i) => i.status === "uploading" || i.status === "queued").length);

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "queued":
      return t("upload.queued", { size: fmt.formatBytes(item.file.size) });
    case "uploading":
      return item.progress >= 1 ? t("upload.finalizing") : t("upload.progress", { pct: Math.round(item.progress * 100), size: fmt.formatBytes(item.file.size) });
    case "done":
      return t("upload.done");
    case "canceled":
      return t("upload.canceled");
    case "error":
      return item.error ?? t("upload.errors.failed");
  }
}
const busy = (i: UploadItem) => i.status === "uploading" || i.status === "queued";
</script>

<template>
  <div v-if="items.length" class="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-divider bg-raised shadow-floating">
    <button class="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-extrabold text-contrast" @click="collapsed = !collapsed">
      <span class="flex items-center gap-2">
        <span v-if="active" class="h-2 w-2 animate-pulse rounded-full bg-brand" />
        {{ active > 0 ? t("upload.panelUploading", { count: active }) : t("upload.panelDone") }}
      </span>
      <ChevronDown :class="['h-5 w-5 text-secondary transition', collapsed ? 'rotate-180' : '']" />
    </button>
    <ul v-if="!collapsed" class="max-h-80 divide-y divide-divider overflow-y-auto border-t border-divider">
      <li v-for="item in items" :key="item.key" class="flex items-center gap-3 px-4 py-3">
        <div class="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-button">
          <img v-if="item.previewUrl" :src="item.previewUrl" alt="" class="h-full w-full object-cover" />
          <Film v-else class="absolute inset-0 m-auto h-5 w-5 text-secondary" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-contrast">{{ item.title }}</p>
          <p :class="['truncate text-xs font-semibold', item.status === 'error' ? 'text-red' : 'text-secondary']">{{ statusText(item) }}</p>
          <div v-if="busy(item)" class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-button">
            <div class="h-full rounded-full bg-brand transition-[width] duration-300" :style="{ width: `${Math.round(item.progress * 100)}%` }" />
          </div>
        </div>
        <span v-if="item.status === 'done'" class="flex h-7 w-7 items-center justify-center rounded-full bg-brand-highlight text-brand"><Check class="h-4 w-4" /></span>
        <UiButton
          v-else
          color="transparent"
          size="sm"
          icon-only
          :aria-label="busy(item) ? t('upload.cancel') : t('upload.dismiss')"
          @click="busy(item) ? emit('cancel', item) : emit('dismiss', item.key)"
          ><X
        /></UiButton>
      </li>
    </ul>
  </div>
</template>
