/**
 * Análisis local del archivo en el navegador, ANTES de subirlo:
 *  - duración (metadatos del <video>)
 *  - miniatura: se busca un fotograma al ~10 % del video (máx. 3 s, evita
 *    negros iniciales), se dibuja en un <canvas> y se exporta a JPEG.
 *
 * Todo ocurre en el dispositivo del usuario con el decodificador del propio
 * navegador: el VPS no descarga, decodifica ni procesa nada.
 * Si el navegador no puede decodificar el formato (p. ej. algunos MKV/HEVC),
 * se devuelve `thumbnail: null` y la plataforma usa el respaldo del proveedor.
 */
export interface ProbeResult {
  durationSec: number | null;
  thumbnail: Blob | null;
}

const THUMB_WIDTH = 640;
const JPEG_QUALITY = 0.8;

export function probeVideo(file: File, timeoutMs = 10_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let duration: number | null = null;
    let settled = false;

    const done = (thumbnail: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve({ durationSec: duration, thumbnail });
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (!video.videoWidth) return done(null); // solo audio / códec no soportado
      video.currentTime = duration ? Math.min(3, duration * 0.1) : 0;
    };

    video.onseeked = () => {
      const scale = Math.min(1, THUMB_WIDTH / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done(blob), "image/jpeg", JPEG_QUALITY);
    };

    video.onerror = () => done(null);
    video.src = url;
  });
}
