"use client";

/**
 * Reproductor HTML5 agnóstico al proveedor.
 *
 * Recibe una `PlaybackSource` genérica ({ kind: "hls" | "mp4", url }) y elige
 * la tecnología adecuada: hls.js (MSE) para HLS, HLS nativo en iOS/Safari, o
 * reproducción progresiva para MP4. Plyr aporta los controles y el selector
 * de calidades cuando el manifiesto ofrece varias.
 */
import "plyr/dist/plyr.css";
import { useMessages, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type Plyr from "plyr";
import { detectAdblock } from "@/lib/adblock";
import type { PlaybackSource } from "@/server/video-providers/types";


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

export function VideoPlayer({
  source,
  title,
  autoPlay = false,
  viewUrl,
  qualifyAfterSec,
}: {
  source: PlaybackSource;
  title: string;
  autoPlay?: boolean;
  /** Ruta firmada para contar la vista (una vez, al empezar a reproducir). */
  viewUrl?: string;
  /** Segundos reproducidos para que la vista sea monetizable (`undefined` = sin monetizar). */
  qualifyAfterSec?: number;
}) {
  const t = useTranslations("player");
  const messages = useMessages();
  // Textos de los controles de Plyr, sin pasar por ICU: {seektime} lo sustituye Plyr.
  const plyrI18n = useRef<Record<string, unknown>>({});
  plyrI18n.current = { ...messages.player.plyr, qualityLabel: { 0: t("auto") } };
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // Cuenta la vista en la primera reproducción real, no al cargar la página.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !viewUrl) return;
    const onPlay = () => {
      if (!navigator.sendBeacon?.(viewUrl)) void fetch(viewUrl, { method: "POST", keepalive: true }).catch(() => {});
    };
    video.addEventListener("playing", onPlay, { once: true });
    return () => video.removeEventListener("playing", onPlay);
  }, [viewUrl]);

  // Vista monetizable: tiempo REAL reproducido (no saltos) ≥ umbral, o el 50 %
  // si el video es más corto. Se avisa una sola vez, indicando si hay bloqueador.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !viewUrl || !qualifyAfterSec) return;
    let played = 0;
    let last: number | null = null;
    let sent = false;

    const onTime = () => {
      if (sent || video.paused || video.seeking) return;
      const t = video.currentTime;
      if (last !== null && t > last && t - last < 2) played += t - last;
      last = t;
      const threshold = Math.min(qualifyAfterSec, Number.isFinite(video.duration) ? video.duration * 0.5 : qualifyAfterSec);
      if (played >= threshold) {
        sent = true;
        void detectAdblock().then((blocked) => {
          const url = `${viewUrl}&stage=q&ad=${blocked ? 0 : 1}`;
          if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
        });
      }
    };
    const reset = () => (last = null);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeking", reset);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeking", reset);
    };
  }, [viewUrl, qualifyAfterSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let player: Plyr | undefined;
    let hls: import("hls.js").default | undefined;
    let disposed = false;

    const mount = async (extra: Partial<Plyr.Options> = {}) => {
      const { default: PlyrCtor } = await import("plyr");
      if (disposed) return;
      player = new PlyrCtor(video, { ...BASE_OPTIONS, i18n: plyrI18n.current, autoplay: autoPlay, ...extra });
    };

    (async () => {
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
        setFailed(true);
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
        setFailed(true);
        instance.destroy();
      });

      instance.loadSource(source.url);
      instance.attachMedia(video);
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      player?.destroy();
      hls?.destroy();
    };
  }, [source.kind, source.url, autoPlay]);

  return (
    <div className="relative h-full w-full bg-black [&_.plyr]:h-full [&_.plyr__video-wrapper]:h-full">
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        preload="metadata"
        poster={source.posterUrl ?? undefined}
        aria-label={title}
        onError={() => source.kind === "mp4" && setFailed(true)}
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm text-zinc-200">
          {t("failed")}
        </div>
      )}
    </div>
  );
}
