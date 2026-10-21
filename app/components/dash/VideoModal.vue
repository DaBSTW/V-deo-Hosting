<script setup lang="ts">
/** Detalle rápido: vista previa real del embed + códigos para copiar. */
import { ExternalLink, Pencil, Trash2 } from "lucide-vue-next";

const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const video = computed(() => d.videos.value.find((v) => v.id === d.openId.value) ?? null);
const ready = computed(() => video.value?.status === "ready");
const close = () => (d.openId.value = null);
</script>

<template>
  <UiModal :open="!!video" :title="video?.title" size="xl" @close="close">
    <div v-if="video" class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="px-5 pb-5 lg:pr-0">
        <div class="overflow-hidden rounded-2xl bg-black">
          <iframe
            v-if="ready"
            :key="video.id"
            :src="video.embedUrl"
            :title="video.title"
            class="aspect-video w-full"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowfullscreen
          />
          <DashVideoThumb v-else :video="video" />
        </div>
      </div>

      <div class="space-y-5 px-5 pb-5">
        <dl class="grid grid-cols-2 gap-3">
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.status") }}</dt>
            <dd class="mt-1"><DashStatusBadge :status="video.status" /></dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.duration") }}</dt>
            <dd class="mt-1 font-bold text-contrast">{{ fmt.formatDuration(video.durationSec) }}</dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.size") }}</dt>
            <dd class="mt-1 font-bold text-contrast">{{ fmt.formatBytes(video.sizeBytes) }}</dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.uploaded") }}</dt>
            <dd class="mt-1 truncate font-bold text-contrast">{{ fmt.formatDate(video.createdAt) }}</dd>
          </div>
        </dl>

        <label class="block">
          <span class="label">{{ t("video.modal.folder") }}</span>
          <select
            :value="video.folderId ?? ''"
            class="input cursor-pointer"
            @change="d.actions.move([video.id], ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">{{ t("video.modal.noFolder") }}</option>
            <option v-for="f in d.folders.value" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>

        <div class="flex items-center justify-between gap-4 rounded-2xl bg-button px-4 py-3">
          <span>
            <span class="block text-sm font-bold text-contrast">{{ t("video.modal.allowDownload") }}</span>
            <span class="block text-xs text-secondary">{{ t("video.modal.allowDownloadHint") }}</span>
          </span>
          <UiToggle :model-value="video.allowDownload" :label="t('video.modal.allowDownload')" @update:model-value="(v) => d.actions.setAllowDownload(video!, v)" />
        </div>

        <div :class="ready ? '' : 'pointer-events-none opacity-50'">
          <span class="label">{{ t("video.modal.embedCode") }}</span>
          <UiCopyField :value="video.iframe" :label="t('video.modal.embedCode')" multiline />
        </div>
        <div :class="ready ? '' : 'pointer-events-none opacity-50'">
          <span class="label">{{ t("video.modal.directLink") }}</span>
          <UiCopyField :value="video.watchUrl" :label="t('video.modal.directLink')" />
        </div>

        <div class="flex flex-wrap gap-2 border-t border-divider pt-4">
          <UiButton size="sm" @click="d.actions.rename(video)"><Pencil />{{ t("video.modal.rename") }}</UiButton>
          <UiButton v-if="ready" size="sm" :href="video.watchUrl" target="_blank" rel="noopener"><ExternalLink />{{ t("video.modal.open") }}</UiButton>
          <UiButton size="sm" color="red" @click="d.actions.remove(video)"><Trash2 />{{ t("video.modal.delete") }}</UiButton>
        </div>
      </div>
    </div>
  </UiModal>
</template>
