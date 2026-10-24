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
import { DEFAULT_PLAYER, contrastOn, type IntroRange, type PlayerSettings } from "#shared/lib/player-settings";
import { ChevronsRight, ExternalLink, Volume2, VolumeX } from "lucide-vue-next";
import { loadVast, ping, type VastAd, type VastEvent } from "~/lib/vast";
import { adDue, markAdShown, openPopunder } from "~/lib/popunder";
import type { PlayerAds } from "#srv/videos/service";

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
    /** Tramo de la intro para «Saltar intro» (ya resuelto por el servidor). */
    intro?: IntroRange | null;
    /** Subtítulos WebVTT (rutas propias, mismo dominio). */
    subtitles?: { id: string; lang: string; label: string; isDefault: boolean; src: string }[];
    /** Pre-roll VAST y popunder (`null` = sin anuncios: Premium o video no monetizado). */
    ads?: PlayerAds | null;
  }>(),
  { autoPlay: false, appearance: () => DEFAULT_PLAYER, embed: false, resumeKey: undefined, intro: null, subtitles: () => [], ads: null },
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
/** «Saltar intro»: visible mientras la reproducción está dentro del tramo. */
const inIntro = ref(false);
const skipIntro = () => {
  if (props.intro && videoEl.value) videoEl.value.currentTime = props.intro.end;
  inIntro.value = false;
};

// ---------------------------------------------------------------- anuncios
type AdPhase = "none" | "loading" | "ready" | "playing" | "done";
const adPhase = ref<AdPhase>("none");
const ad = shallowRef<VastAd | null>(null);
const adEl = ref<HTMLVideoElement>();
const adLeft = ref(0);
const adSkipIn = ref<number | null>(null);
const adMuted = ref(false);
const adActive = computed(() => adPhase.value === "playing");
let skipAd: () => void = () => {};
let adSent = new Set<VastEvent>();

function adTrack(ev: VastEvent) {
  if (!ad.value || adSent.has(ev)) return;
  adSent.add(ev);
  ping(ad.value.tracking[ev]);
}

function adClick() {
  if (!ad.value?.clickThrough) return;
  ping(ad.value.clickTracking);
  window.open(ad.value.clickThrough, "_blank", "noopener,noreferrer");
}
function adToggleMute() {
  if (!adEl.value) return;
  adEl.value.muted = !adEl.value.muted;
  adMuted.value = adEl.value.muted;
  adTrack(adMuted.value ? "mute" : "unmute");
  adSent.delete(adMuted.value ? "unmute" : "mute");
}

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

  // Saltar intro: botón durante el tramo o salto automático (una sola vez, por
  // si el espectador vuelve atrás a propósito para verla).
  {
    let autoDone = false;
    const onIntroTime = () => {
      const r = props.intro;
      if (!r || !look.value.skipIntro.enabled) return (inIntro.value = false);
      const now = video.currentTime;
      // Si la intro marcada pasa del final real del archivo, se recorta a su duración.
      const end = Number.isFinite(video.duration) ? Math.min(r.end, video.duration) : r.end;
      const inside = now >= r.start && now < end - 0.5;
      if (inside && look.value.skipIntro.auto && !autoDone && !video.paused) {
        autoDone = true;
        video.currentTime = r.end;
        inIntro.value = false;
        return;
      }
      inIntro.value = inside;
    };
    video.addEventListener("timeupdate", onIntroTime);
    video.addEventListener("seeked", onIntroTime);
    disposers.push(() => {
      video.removeEventListener("timeupdate", onIntroTime);
      video.removeEventListener("seeked", onIntroTime);
    });
  }

  // ---------------------------------------------------------------- anuncios
  const ads = props.ads;
  if (ads?.popunderUrl) {
    // Primer clic sobre el reproductor (el de «reproducir»): el navegador solo
    // permite abrir ventanas dentro de un gesto del usuario.
    const root = video.closest(".player") as HTMLElement | null;
    const onFirstClick = () => openPopunder(ads.popunderUrl, "ad:popunder", ads.popunderEveryMin);
    root?.addEventListener("click", onFirstClick, { capture: true, once: true });
    disposers.push(() => root?.removeEventListener("click", onFirstClick, { capture: true }));
  }
  if (ads?.vastUrl && adDue("ad:preroll", ads.vastEveryMin)) {
    adPhase.value = "loading";
    // Se pide al montar, para que el anuncio esté listo cuando el espectador pulse «reproducir».
    void loadVast(ads.vastUrl, { timeoutMs: 6000, canPlay: (type) => !!video.canPlayType(type) }).then((res) => {
      if (disposed) return;
      ad.value = res;
      adPhase.value = res ? "ready" : "done";
      if (res && adEl.value) {
        adEl.value.src = res.mediaUrl;
        adEl.value.load();
      }
    });

    const finishAd = (resume = true) => {
      adPhase.value = "done";
      adEl.value?.pause();
      if (resume) void video.play().catch(() => {});
    };
    const startAd = () => {
      const el = adEl.value;
      const a = ad.value;
      if (!el || !a) return finishAd();
      // Si el anuncio llegó antes de montarse el reproductor, aún no tiene fuente.
      if (!el.currentSrc) el.src = a.mediaUrl;
      adSent = new Set();
      adPhase.value = "playing";
      markAdShown("ad:preroll");
      const fallbackSkip = ads.skipAfterSec > 0 ? ads.skipAfterSec : null;
      const skipAt = a.skipOffset ?? fallbackSkip;
      const onTime = () => {
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : a.duration;
        const t = el.currentTime;
        adLeft.value = Math.max(0, Math.ceil(d - t));
        adSkipIn.value = skipAt == null ? null : Math.max(0, Math.ceil(skipAt - t));
        if (d) {
          if (t >= d * 0.25) adTrack("firstQuartile");
          if (t >= d * 0.5) adTrack("midpoint");
          if (t >= d * 0.75) adTrack("thirdQuartile");
        }
      };
      const cleanup = () => {
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
      };
      const onEnded = () => {
        adTrack("complete");
        cleanup();
        finishAd();
      };
      const onError = () => {
        ping(a.errors, { ERRORCODE: "405" });
        cleanup();
        finishAd();
      };
      skipAd = () => {
        adTrack("skip");
        cleanup();
        finishAd();
      };
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      el.muted = video.muted;
      adMuted.value = el.muted;
      el.play()
        .then(() => {
          ping(a.impressions);
          adTrack("start");
        })
        .catch(() => {
          // Sin permiso para sonar: se intenta en silencio.
          el.muted = adMuted.value = true;
          el.play().then(() => (ping(a.impressions), adTrack("start"))).catch(onError);
        });
    };

    // La primera reproducción del contenido se detiene y entra el anuncio.
    const onContentPlay = () => {
      if (adPhase.value === "playing") return video.pause();
      if (adPhase.value === "ready") {
        video.pause();
        return startAd();
      }
      if (adPhase.value === "loading") {
        video.pause();
        // El anuncio aún no llegó: se espera un poco y, si no, empieza el video.
        const waitUntil = Date.now() + 3000;
        const tick = () => {
          if (disposed) return;
          if (adPhase.value === "ready") return startAd();
          if (adPhase.value === "loading" && Date.now() < waitUntil) return void setTimeout(tick, 150);
          finishAd();
        };
        tick();
      }
    };
    video.addEventListener("play", onContentPlay);
    disposers.push(() => video.removeEventListener("play", onContentPlay));
  }

  let player: Plyr | undefined;
  let hls: import("hls.js").default | undefined;
  let disposed = false;
  // Textos de los controles de Plyr, sin pasar por ICU: {seektime} lo sustituye Plyr.
  const plyrI18n = { ...messagesFor(locale.value).player.plyr, qualityLabel: { 0: t("player.auto") } };

  const a = look.value;
  const hasSubs = props.subtitles.length > 0;
  const defaultSub = props.subtitles.find((s) => s.isDefault);
  // Con subtítulos: botón CC junto al volumen y selector de idioma en ajustes.
  const controls = (BASE_OPTIONS.controls as string[])
    .filter((c) => c !== "pip" || a.pip)
    .flatMap((c) => (c === "settings" && hasSubs ? ["captions", c] : [c]));
  const settings = [...(hasSubs ? ["captions"] : []), ...(BASE_OPTIONS.settings as string[]).filter((c) => c !== "speed" || a.speed)];
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
      captions: { active: !!defaultSub, language: defaultSub?.lang ?? "auto", update: true },
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
    >
      <track v-for="s in subtitles" :key="s.id" kind="subtitles" :src="s.src" :srclang="s.lang" :label="s.label" :default="s.isDefault || undefined" />
    </video>
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
      <!-- Pre-roll: cubre el reproductor (también sus controles) mientras dura. -->
      <div v-show="adActive" class="player-ad" role="region" :aria-label="t('player.ad')">
        <video ref="adEl" class="h-full w-full object-contain" playsinline preload="auto" @click="adClick" />
        <div class="player-ad__bar">
          <span class="player-ad__badge">{{ t("player.ad") }} · {{ Math.floor(adLeft / 60) }}:{{ String(adLeft % 60).padStart(2, "0") }}</span>
          <button v-if="ad?.clickThrough" type="button" class="player-ad__link" @click="adClick">{{ t("player.adVisit") }}<ExternalLink class="h-3.5 w-3.5" /></button>
        </div>
        <button type="button" class="player-ad__mute" :aria-label="adMuted ? t('player.adUnmute') : t('player.adMute')" @click="adToggleMute">
          <component :is="adMuted ? VolumeX : Volume2" class="h-5 w-5" />
        </button>
        <button v-if="adSkipIn === 0" type="button" class="player-ad__skip" @click="skipAd()">{{ t("player.adSkip") }}<ChevronsRight class="h-4 w-4" /></button>
        <span v-else-if="adSkipIn != null" class="player-ad__skip player-ad__skip--wait">{{ t("player.adSkipIn", { seconds: adSkipIn }) }}</span>
      </div>
      <Transition name="skip">
        <button v-if="inIntro" type="button" class="player-skip" @click.stop="skipIntro">
          {{ t("player.skipIntro") }}<ChevronsRight class="h-4 w-4" />
        </button>
      </Transition>
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
/* En pantallas estrechas el deslizador de volumen dejaba la barra de progreso
   en unos píxeles: se queda solo el botón de silencio (el volumen va por el móvil). */
@media (max-width: 480px) {
  .player :deep(.plyr__volume input[type="range"]) {
    display: none;
  }
  .player :deep(.plyr__volume) {
    min-width: 0;
    width: auto;
  }
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
.player-ad {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: #000;
}
.player-ad video {
  cursor: pointer;
}
.player-ad__bar {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(rgba(0, 0, 0, 0.6), transparent);
  pointer-events: none;
}
.player-ad__badge {
  border-radius: 6px;
  background: #f5d90a;
  padding: 3px 8px;
  color: #000;
  font: 800 12px/1.3 var(--font-sans);
}
.player-ad__link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  padding: 6px 10px;
  color: #fff;
  font: 700 13px/1 var(--font-sans);
  pointer-events: auto;
}
.player-ad__mute {
  position: absolute;
  left: 14px;
  bottom: 18px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.player-ad__skip {
  position: absolute;
  right: 0;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-right: 0;
  border-radius: 10px 0 0 10px;
  background: rgba(0, 0, 0, 0.75);
  padding: 11px 16px;
  color: #fff;
  font: 700 14px/1 var(--font-sans);
}
button.player-ad__skip:hover {
  background: var(--player-accent, var(--brand));
  color: var(--player-on-accent, #000);
}
.player-ad__skip--wait {
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}
.player-skip {
  position: absolute;
  right: 16px;
  bottom: 64px;
  /* Por debajo de los controles de Plyr (z 3): el menú de ajustes queda encima. */
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  color: #fff;
  font: 700 14px/1 var(--font-sans);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.player-skip:hover {
  background: var(--player-accent, var(--brand));
  border-color: transparent;
  color: var(--player-on-accent, #000);
}
/* Si la marca de agua está abajo a la derecha, el botón queda por encima. */
.player-wm--br ~ .player-skip {
  bottom: 108px;
}
.skip-enter-active,
.skip-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.skip-enter-from,
.skip-leave-to {
  opacity: 0;
  transform: translateY(6px);
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
/* Solo el título: `:global(.plyr--hide-controls) .player-title` compila a
   `.plyr--hide-controls` y dejaba transparente todo el reproductor. */
.player :deep(.plyr--hide-controls .player-title) {
  opacity: 0;
}
</style>
