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
import { useEffect, useRef, useState } from "react";
import type Plyr from "plyr";
import type { PlaybackSource } from "@/server/video-providers/types";

const I18N_ES = {
  restart: "Reiniciar",
  rewind: "Retroceder {seektime}s",
  play: "Reproducir",
  pause: "Pausa",
  fastForward: "Avanzar {seektime}s",
  seek: "Buscar",
  played: "Reproducido",
  buffered: "En búfer",
  currentTime: "Tiempo actual",
  duration: "Duración",
  volume: "Volumen",
  mute: "Silenciar",
  unmute: "Activar sonido",
  enterFullscreen: "Pantalla completa",
  exitFullscreen: "Salir de pantalla completa",
  pip: "Imagen en imagen",
  settings: "Ajustes",
  menuBack: "Volver",
  speed: "Velocidad",
  normal: "Normal",
  quality: "Calidad",
  loop: "Bucle",
  qualityLabel: { 0: "Auto" },
};

const BASE_OPTIONS: Plyr.Options = {
  controls: ["play-large", "play", "progress", "current-time", "duration", "mute", "volume", "settings", "pip", "fullscreen"],
  settings: ["quality", "speed"],
  speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
  i18n: I18N_ES,
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
}: {
  source: PlaybackSource;
  title: string;
  autoPlay?: boolean;
  /** Ruta firmada para contar la vista (una vez, al empezar a reproducir). */
  viewUrl?: string;
}) {
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let player: Plyr | undefined;
    let hls: import("hls.js").default | undefined;
    let disposed = false;

    const mount = async (extra: Partial<Plyr.Options> = {}) => {
      const { default: PlyrCtor } = await import("plyr");
      if (disposed) return;
      player = new PlyrCtor(video, { ...BASE_OPTIONS, autoplay: autoPlay, ...extra });
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
          No se pudo reproducir el video. Recarga la página para intentarlo de nuevo.
        </div>
      )}
    </div>
  );
}
