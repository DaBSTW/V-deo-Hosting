<script setup lang="ts">
/**
 * Reproductor HTML5 agnóstico al proveedor.
 *
 * Recibe una fuente genérica ({ kind: "hls" | "mp4", url }) y elige la
 * tecnología: hls.js (MSE) para HLS, HLS nativo en iOS/Safari o reproducción
 * progresiva para MP4. Plyr aporta los controles y el selector de calidades.
 */
import "plyr/dist/plyr.css";
import type Plyr from "plyr";
import { detectAdblock } from "~/lib/adblock";
import { messagesFor } from "#shared/i18n/messages";
import type { PlaybackSource } from "#srv/video-providers/types";

const props = withDefaults(
  defineProps<{
    source: PlaybackSource;
    title: string;
    autoPlay?: boolean;
    /** Ruta firmada para contar la vista (una vez, al empezar a reproducir). */
    viewUrl?: string;
    /** Segundos reproducidos para que la vista sea monetizable (`undefined` = sin monetizar). */
    qualifyAfterSec?: number;
  }>(),
  { autoPlay: false },
);

const { t, locale } = useI18n();
const videoEl = ref<HTMLVideoElement>();
const failed = ref(false);

const BASE_OPTIONS: Plyr.Options = {
  controls: ["play-large", "play", "progress", "current-time", "duration", "mute", "volume", "settings", "pip", "fullscreen"],
  settings: ["quality", "speed"],
  speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
  keyboard: { focused: true, global: true },
  fullscreen: { enabled: true, fallback: true, iosNative: true },
  storage: { enabled: true, key: "player" },
  // Recursos servidos desde nuestro propio dominio (sin CDN de terceros).
  iconUrl: "/plyr.svg",
  blankVideo: "/blank.mp4",
};

const beacon = (url: string) => {
  if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
};

let cleanup: (() => void) | undefined;

onMounted(() => {
  const video = videoEl.value;
  if (!video) return;
  const disposers: Array<() => void> = [];

  // Cuenta la vista en la primera reproducción real, no al cargar la página.
  if (props.viewUrl) {
    const viewUrl = props.viewUrl;
    const onPlay = () => beacon(viewUrl);
    video.addEventListener("playing", onPlay, { once: true });
    disposers.push(() => video.removeEventListener("playing", onPlay));
  }

  // Vista monetizable: tiempo REAL reproducido (sin saltos) ≥ umbral, o el 50 %
  // si el video es más corto. Se avisa una sola vez, indicando si hay bloqueador.
  if (props.viewUrl && props.qualifyAfterSec) {
    const viewUrl = props.viewUrl;
    const qualifyAfterSec = props.qualifyAfterSec;
    let played = 0;
    let last: number | null = null;
    let sent = false;
    const onTime = () => {
      if (sent || video.paused || video.seeking) return;
      const now = video.currentTime;
      if (last !== null && now > last && now - last < 2) played += now - last;
      last = now;
      const threshold = Math.min(qualifyAfterSec, Number.isFinite(video.duration) ? video.duration * 0.5 : qualifyAfterSec);
      if (played >= threshold) {
        sent = true;
        void detectAdblock().then((blocked) => beacon(`${viewUrl}&stage=q&ad=${blocked ? 0 : 1}`));
      }
    };
    const reset = () => (last = null);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeking", reset);
    disposers.push(() => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeking", reset);
    });
  }

  let player: Plyr | undefined;
  let hls: import("hls.js").default | undefined;
  let disposed = false;
  // Textos de los controles de Plyr, sin pasar por ICU: {seektime} lo sustituye Plyr.
  const plyrI18n = { ...messagesFor(locale.value).player.plyr, qualityLabel: { 0: t("player.auto") } };

  const mount = async (extra: Partial<Plyr.Options> = {}) => {
    const { default: PlyrCtor } = await import("plyr");
    if (disposed) return;
    player = new PlyrCtor(video, { ...BASE_OPTIONS, i18n: plyrI18n, autoplay: props.autoPlay, ...extra });
  };

  (async () => {
    const source = props.source;
    if (source.kind === "mp4") {
      video.src = source.url;
      return mount();
    }
    const { default: Hls } = await import("hls.js");
    if (disposed) return;
    if (!Hls.isSupported()) {
      // iOS Safari: HLS nativo (calidad adaptativa automática).
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source.url;
        return mount();
      }
      failed.value = true;
      return;
    }
    const instance = new Hls({ capLevelToPlayerSize: true, startLevel: -1, enableWorker: true });
    hls = instance;
    let recoveries = 0;
    instance.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const heights = [...new Set(data.levels.map((l) => l.height).filter(Boolean))].sort((a, b) => b - a);
      void mount(
        heights.length > 1
          ? {
              quality: {
                default: 0, // 0 = Auto (ABR)
                options: [0, ...heights],
                forced: true,
                onChange: (q: number) => {
                  instance.currentLevel = q === 0 ? -1 : instance.levels.findIndex((l) => l.height === q);
                },
              },
            }
          : {},
      );
    });
    instance.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (recoveries++ < 3) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) return instance.startLoad();
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return instance.recoverMediaError();
      }
      failed.value = true;
      instance.destroy();
    });
    instance.loadSource(source.url);
    instance.attachMedia(video);
  })().catch(() => (failed.value = true));

  cleanup = () => {
    disposed = true;
    disposers.forEach((d) => d());
    player?.destroy();
    hls?.destroy();
  };
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <div class="player relative h-full w-full bg-black">
    <video
      ref="videoEl"
      class="h-full w-full"
      playsinline
      preload="metadata"
      :poster="source.posterUrl ?? undefined"
      :aria-label="title"
      @error="source.kind === 'mp4' && (failed = true)"
    />
    <div v-if="failed" class="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm font-semibold text-white">
      {{ t("player.failed") }}
    </div>
  </div>
</template>

<style scoped>
.player :deep(.plyr) {
  height: 100%;
  --plyr-color-main: var(--brand);
  --plyr-video-control-color-hover: var(--on-brand);
  --plyr-font-family: var(--font-sans);
  --plyr-menu-radius: 12px;
  --plyr-control-radius: 10px;
}
.player :deep(.plyr__video-wrapper) {
  height: 100%;
}
</style>
