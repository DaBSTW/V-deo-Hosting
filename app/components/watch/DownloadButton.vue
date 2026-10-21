<script setup lang="ts">
/**
 * Una sola calidad → enlace directo. Varias → menú para elegir.
 * Los enlaces apuntan a nuestra pasarela `/media/...`, que redirige a la
 * descarga directa del proveedor (el archivo no pasa por el VPS).
 */
import { ChevronDown, Download } from "lucide-vue-next";
import type { DownloadChoice } from "~/types/video";

const props = defineProps<{ options: DownloadChoice[] }>();
const { t } = useI18n();
const fmt = useFormat();
const open = ref(false);
const root = ref<HTMLElement>();

const labelOf = (o: DownloadChoice) =>
  o.kind === "original" ? (o.height ? t("watch.originalHeight", { height: o.height }) : t("watch.original")) : o.kind === "single" ? "MP4" : `${o.height}p`;

useDismiss(root, open);
const single = computed(() => (props.options.length === 1 ? props.options[0] : null));
</script>

<template>
  <UiButton v-if="single" :href="single.path" color="brand" rel="nofollow">
    <Download />
    {{ t("watch.download") }}
    <span v-if="single.sizeBytes" class="text-xs font-semibold opacity-70">{{ fmt.formatBytes(single.sizeBytes) }}</span>
  </UiButton>
  <div v-else ref="root" class="relative">
    <UiButton color="brand" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">
      <Download />
      {{ t("watch.download") }}
      <ChevronDown :class="['transition', open ? 'rotate-180' : '']" />
    </UiButton>
    <Transition enter-active-class="transition duration-100" enter-from-class="scale-95 opacity-0" leave-active-class="transition duration-75" leave-to-class="opacity-0">
      <div v-if="open" role="menu" class="absolute left-0 z-30 mt-2 w-64 origin-top-left rounded-2xl border border-divider bg-raised p-1.5 shadow-floating">
        <p class="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("watch.chooseQuality") }}</p>
        <a
          v-for="o in options"
          :key="o.path"
          role="menuitem"
          :href="o.path"
          rel="nofollow"
          class="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-contrast transition hover:bg-button"
          @click="open = false"
        >
          <span>{{ labelOf(o) }}</span>
          <span class="text-xs tabular-nums text-secondary">{{ o.sizeBytes ? fmt.formatBytes(o.sizeBytes) : "" }}</span>
        </a>
      </div>
    </Transition>
  </div>
</template>
