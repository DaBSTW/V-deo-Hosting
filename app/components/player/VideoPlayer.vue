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
import { DEFAULT_PLAYER, contrastOn, type PlayerSettings } from "#shared/lib/player-settings";

const props = withDefaults(
  defineProps<{
    source: PlaybackSource;
    title: string;
    autoPlay?: boolean;
    /** Ruta firmada para contar la vista (una vez, al empezar a reproducir). */
    viewUrl?: string;
    /** Segundos reproducidos para que la vista sea monetizable (`undefined` = sin monetizar). */
    qualifyAfterSec?: number;
    /** Personalización del dueño del video (color, marca de agua, controles…). */
    appearance?: PlayerSettings;
    /** Reproductor insertado (iframe): admite inicio automático y título superpuesto. */
    embed?: boolean;
    /** Identificador para recordar por dónde iba el espectador (`resume`). */
    resumeKey?: string;
  }>(),
  { autoPlay: false, appearance: () => DEFAULT_PLAYER, embed: false, resumeKey: undefined },
);

const { t, locale } = useI18n();
const videoEl = ref<HTMLVideoElement>();
const failed = ref(false);
/** Contenedor de Plyr: la marca de agua y el título se teletransportan dentro (siguen en pantalla completa). */
const overlayTarget = ref<HTMLElement | null>(null);
const look = computed(() => props.appearance);
const accentStyle = computed(() => ({ "--player-accent": look.value.color, "--player-on-accent": contrastOn(look.value.color) }));
const wm = computed(() => look.value.watermark);
const showWatermark = computed(() => (wm.value.type === "text" && wm.value.text.trim()) || (wm.value.type === "image" && wm.value.imageUrl));
/** Inicio automático: por URL (?autoplay=1) o por la personalización (solo insertado, en silencio). */
const autoStart = computed(() => props.autoPlay || (props.embed && look.value.autoplay));

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

  // Continuar donde lo dejó: posición por video en localStorage (puede no estar disponible).
  if (props.resumeKey && look.value.resume) {
    const key = `pos:${props.resumeKey}`;
    let lastSave = 0;
    const onMeta = () => {
      try {
        const t0 = Number(localStorage.getItem(key));
        if (t0 > 5 && (!Number.isFinite(video.duration) || t0 < video.duration - 10)) video.currentTime = t0;
      } catch {
        /* sin almacenamiento */
      }
    };
    const onSave = () => {
      if (Date.now() - lastSave < 4000) return;
      lastSave = Date.now();
      try {
        localStorage.setItem(key, String(Math.floor(video.currentTime)));
      } catch {
        /* sin almacenamiento */
      }
    };
    const onEnd = () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* sin almacenamiento */
      }
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("timeupdate", onSave);
    video.addEventListener("ended", onEnd);
    disposers.push(() => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onSave);
      video.removeEventListener("ended", onEnd);
    });
  }

  let player: Plyr | undefined;
  let hls: import("hls.js").default | undefined;
  let disposed = false;
  // Textos de los controles de Plyr, sin pasar por ICU: {seektime} lo sustituye Plyr.
  const plyrI18n = { ...messagesFor(locale.value).player.plyr, qualityLabel: { 0: t("player.auto") } };

  const a = look.value;
  const controls = (BASE_OPTIONS.controls as string[]).filter((c) => c !== "pip" || a.pip);
  const settings = (BASE_OPTIONS.settings as string[]).filter((c) => c !== "speed" || a.speed);
  // El inicio automático solo funciona en silencio en los navegadores actuales.
  if (autoStart.value) video.muted = true;
  const mount = async (extra: Partial<Plyr.Options> = {}) => {
    const { default: PlyrCtor } = await import("plyr");
    if (disposed) return;
    player = new PlyrCtor(video, {
      ...BASE_OPTIONS,
      controls,
      settings,
      loop: { active: a.loop },
      i18n: plyrI18n,
      autoplay: autoStart.value,
      muted: autoStart.value,
      ...extra,
    });
    overlayTarget.value = (player as unknown as { elements: { container: HTMLElement } }).elements.container ?? null;
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
    overlayTarget.value = null;
    disposers.forEach((d) => d());
    player?.destroy();
    hls?.destroy();
  };
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <div class="player relative h-full w-full bg-black" :style="accentStyle">
    <video
      ref="videoEl"
      class="h-full w-full"
      playsinline
      preload="metadata"
      :poster="source.posterUrl ?? undefined"
      :aria-label="title"
      @error="source.kind === 'mp4' && (failed = true)"
    />
    <Teleport v-if="overlayTarget" :to="overlayTarget">
      <!-- Título superpuesto (solo insertado): se oculta junto con los controles. -->
      <div v-if="embed && look.showTitle" class="player-title">{{ title }}</div>
      <component
        :is="wm.link ? 'a' : 'div'"
        v-if="showWatermark"
        :href="wm.link || undefined"
        :target="wm.link ? '_blank' : undefined"
        :rel="wm.link ? 'noopener noreferrer nofollow' : undefined"
        :class="['player-wm', `player-wm--${wm.position}`, wm.link ? 'pointer-events-auto' : '', embed && look.showTitle && wm.position.startsWith('t') ? 'player-wm--below-title' : '']"
        :style="{ opacity: wm.opacity / 100 }"
      >
        <img v-if="wm.type === 'image'" :src="wm.imageUrl" alt="" referrerpolicy="no-referrer" />
        <span v-else>{{ wm.text }}</span>
      </component>
    </Teleport>
    <div v-if="failed" class="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm font-semibold text-white">
      {{ t("player.failed") }}
    </div>
  </div>
</template>

<style scoped>
.player :deep(.plyr) {
  height: 100%;
  --plyr-color-main: var(--player-accent, var(--brand));
  --plyr-video-control-color-hover: var(--player-on-accent, var(--on-brand));
  --plyr-font-family: var(--font-sans);
  --plyr-menu-radius: 12px;
  --plyr-control-radius: 10px;
}
.player :deep(.plyr__video-wrapper) {
  height: 100%;
}
.player-wm {
  position: absolute;
  z-index: 3;
  max-width: 40%;
  pointer-events: none;
  transition: opacity 0.2s;
}
.player-wm img {
  display: block;
  max-height: 44px;
  max-width: 100%;
  object-fit: contain;
}
.player-wm span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: 800 15px/1.2 var(--font-sans);
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}
.player-wm--tl { top: 14px; left: 16px; }
.player-wm--tr { top: 14px; right: 16px; }
.player-wm--bl { bottom: 64px; left: 16px; }
.player-wm--br { bottom: 64px; right: 16px; }
.player-wm--below-title.player-wm--tl,
.player-wm--below-title.player-wm--tr { top: 52px; }
.player-title {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  padding: 14px 18px 28px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: 700 16px/1.3 var(--font-sans);
  color: #fff;
  background: linear-gradient(rgba(0, 0, 0, 0.7), transparent);
  pointer-events: none;
  transition: opacity 0.3s;
}
:global(.plyr--hide-controls) .player-title {
  opacity: 0;
}
</style>
