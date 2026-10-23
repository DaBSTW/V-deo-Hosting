<script setup lang="ts">
/**
 * Botón de descarga con espera para los usuarios gratuitos.
 *
 *  - Una calidad: al pulsar se pide el ticket y empieza la cuenta atrás.
 *  - Varias: se abre el menú y la cuenta atrás empieza al elegir la calidad.
 *  - Premium: el ticket llega sin espera y la descarga empieza al momento.
 *
 * La espera la impone el servidor (el ticket no vale antes de tiempo); el
 * contador solo la muestra. El archivo nunca pasa por el VPS.
 */
import { Check, ChevronDown, Crown, Download, LoaderCircle } from "lucide-vue-next";
import type { DownloadChoice } from "~/types/video";
import { openPopunder } from "~/lib/popunder";

const props = defineProps<{
  publicId: string;
  options: DownloadChoice[];
  premium: boolean;
  waitSec?: number;
  speedLimit?: boolean;
  /** Popunder al pulsar «Descargar» (`null` para Premium o si está desactivado). */
  popunder?: { url: string; everyMin: number } | null;
}>();
const { t } = useI18n();
const fmt = useFormat();
const open = ref(false);
const root = ref<HTMLElement>();
useDismiss(root, open);

type Phase = "idle" | "requesting" | "counting" | "started";
const phase = ref<Phase>("idle");
const chosen = ref<DownloadChoice | null>(null);
const total = ref(0);
const left = ref(0);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
onBeforeUnmount(() => clearInterval(timer));

const labelOf = (o: DownloadChoice) =>
  o.kind === "original" ? (o.height ? t("watch.originalHeight", { height: o.height }) : t("watch.original")) : o.kind === "single" ? "MP4" : `${o.height}p`;
const single = computed(() => (props.options.length === 1 ? props.options[0] : null));
const busy = computed(() => phase.value === "requesting" || phase.value === "counting");
const progress = computed(() => (total.value ? ((total.value - left.value) / total.value) * 100 : 0));

async function start(o: DownloadChoice) {
  if (busy.value) return;
  // Antes de cualquier `await`: el navegador solo abre ventanas dentro del clic.
  if (props.popunder) openPopunder(props.popunder.url, "ad:popunder-dl", props.popunder.everyMin);
  open.value = false;
  error.value = null;
  chosen.value = o;
  phase.value = "requesting";
  try {
    const ticket = await api<{ url: string; waitSec: number }>(`/api/public/videos/${props.publicId}/download`, {
      method: "POST",
      body: JSON.stringify({ option: o.id }),
    });
    if (ticket.waitSec <= 0) return go(ticket.url);
    // Cuenta atrás con la hora real (no se desfasa si la pestaña se congela un momento).
    const readyAt = Date.now() + ticket.waitSec * 1000 + 400;
    total.value = ticket.waitSec;
    left.value = ticket.waitSec;
    phase.value = "counting";
    clearInterval(timer);
    timer = setInterval(() => {
      left.value = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
      if (Date.now() >= readyAt) {
        clearInterval(timer);
        go(ticket.url);
      }
    }, 250);
  } catch (err) {
    phase.value = "idle";
    error.value = (err as Error)?.message || t("common.requestFailed");
  }
}

function go(url: string) {
  phase.value = "started";
  // La respuesta es un adjunto: el navegador descarga y la página se queda.
  window.location.href = url;
  setTimeout(() => {
    if (phase.value === "started") phase.value = "idle";
  }, 4000);
}

function onMain() {
  if (busy.value) return;
  if (single.value) void start(single.value);
  else open.value = !open.value;
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      :class="[
        'hover-bright press relative inline-flex h-10 min-w-40 items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold shadow-[var(--shadow-inset-sm)] transition [&_svg]:h-5 [&_svg]:w-5',
        phase === 'counting' ? 'bg-button text-contrast' : 'bg-brand text-on-brand',
      ]"
      :aria-expanded="single ? undefined : open"
      :aria-haspopup="single ? undefined : 'menu'"
      :aria-busy="busy"
      @click="onMain"
    >
      <!-- Barra de progreso de la espera, dentro del propio botón. -->
      <span v-if="phase === 'counting'" class="absolute inset-y-0 left-0 bg-brand-highlight transition-[width] duration-300 ease-linear" :style="{ width: `${progress}%` }" aria-hidden="true" />
      <span class="relative inline-flex items-center gap-2">
        <template v-if="phase === 'requesting'"><LoaderCircle class="animate-spin" />{{ t("watch.preparing") }}</template>
        <template v-else-if="phase === 'counting'">
          <span class="tabular-nums" aria-live="polite">{{ t("watch.downloadIn", { seconds: left }) }}</span>
        </template>
        <template v-else-if="phase === 'started'"><Check />{{ t("watch.downloadStarted") }}</template>
        <template v-else>
          <Download />
          {{ t("watch.download") }}
          <span v-if="single?.sizeBytes" class="text-xs font-semibold opacity-70">{{ fmt.formatBytes(single.sizeBytes) }}</span>
          <ChevronDown v-if="!single" :class="['transition', open ? 'rotate-180' : '']" />
        </template>
      </span>
    </button>

    <Transition enter-active-class="transition duration-100" enter-from-class="scale-95 opacity-0" leave-active-class="transition duration-75" leave-to-class="opacity-0">
      <div v-if="open" role="menu" class="absolute left-0 z-30 mt-2 w-72 origin-top-left rounded-2xl border border-divider bg-raised p-1.5 shadow-floating">
        <p class="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("watch.chooseQuality") }}</p>
        <button
          v-for="o in options"
          :key="o.id"
          type="button"
          role="menuitem"
          class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-contrast transition hover:bg-button"
          @click="start(o)"
        >
          <span>{{ labelOf(o) }}</span>
          <span class="text-xs tabular-nums text-secondary">{{ o.sizeBytes ? fmt.formatBytes(o.sizeBytes) : "" }}</span>
        </button>
        <p v-if="!premium && waitSec" class="mx-1 mt-1 rounded-xl bg-premium-soft px-3 py-2 text-xs text-primary">
          <Crown class="mr-1 inline h-3.5 w-3.5 text-premium" />{{ t("watch.waitNotice", { seconds: waitSec }) }}
        </p>
      </div>
    </Transition>

    <p v-if="error" class="mt-2 text-sm font-semibold text-red" role="alert">{{ error }}</p>
    <!-- Mientras espera: la alternativa sin esperas. -->
    <div v-if="phase === 'counting' && !premium" class="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-divider bg-raised p-3 shadow-floating">
      <p class="text-sm font-bold text-contrast">{{ t("watch.skipWaitTitle") }}</p>
      <p class="mt-0.5 text-xs text-secondary">{{ speedLimit ? t("watch.skipWaitText") : t("watch.skipWaitTextNoSpeed") }}</p>
      <UiButton to="/premium" color="premium" size="sm" class="mt-2.5"><Crown />{{ t("premium.cta") }}</UiButton>
    </div>
    <p v-if="chosen && phase === 'counting' && !single" class="sr-only">{{ labelOf(chosen) }}</p>
  </div>
</template>
