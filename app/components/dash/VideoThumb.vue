<script setup lang="ts">
/** Miniatura 16:9 con duración y capa de estado. */
import { Film, Play, TriangleAlert } from "lucide-vue-next";
import type { PublicVideo } from "~/composables/useDashboard";

const props = withDefaults(defineProps<{ video: PublicVideo; size?: "lg" | "sm" }>(), { size: "lg" });
const { t } = useI18n();
const fmt = useFormat();
const failed = ref(false);
watch(() => props.video.thumbnailUrl, () => (failed.value = false));
const lg = computed(() => props.size === "lg");
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,var(--surface-4),var(--surface-1))]">
    <img
      v-if="video.thumbnailUrl && !failed"
      :src="video.thumbnailUrl"
      alt=""
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
      @error="failed = true"
    />
    <Film v-else :class="['absolute inset-0 m-auto text-secondary opacity-60', lg ? 'h-9 w-9' : 'h-5 w-5']" />

    <div v-if="video.status === 'ready' && lg" class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg"><Play class="ml-0.5 h-5 w-5 fill-current" /></span>
    </div>

    <div v-if="video.status === 'processing' || video.status === 'uploading'" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white backdrop-blur-[2px]">
      <span :class="['animate-spin rounded-full border-2 border-white/25 border-t-[var(--brand)]', lg ? 'h-7 w-7' : 'h-4 w-4']" />
      <span v-if="lg" class="text-xs font-bold">{{ video.status === "processing" ? t("video.processing") : t("video.uploadingShort") }}</span>
    </div>

    <div v-if="video.status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 text-red">
      <TriangleAlert :class="lg ? 'h-6 w-6' : 'h-4 w-4'" />
      <span v-if="lg" class="text-xs font-bold">{{ t("video.unavailable") }}</span>
    </div>

    <span
      v-if="video.durationSec"
      :class="['absolute bottom-1.5 right-1.5 rounded-md bg-black/80 font-bold tabular-nums text-white', lg ? 'px-1.5 py-0.5 text-[11px]' : 'px-1 text-[10px]']"
      >{{ fmt.formatDuration(video.durationSec) }}</span
    >
  </div>
</template>
