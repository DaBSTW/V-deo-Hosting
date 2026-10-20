/**
 * Cliente de subida agnóstico (navegador).
 *
 * El frontend no sabe a qué proveedor sube: recibe del backend unas
 * instrucciones genéricas (`single` = un PUT, `resumable` = protocolo TUS) y
 * las ejecuta. Cambiar de proveedor en el .env no requiere tocar este código.
 */
import type { ThumbnailUploadInstructions, UploadInstructions } from "@/server/video-providers/types";
import type { PublicVideo } from "@/server/videos/dto";
import { probeVideo } from "./media-probe";

export interface UploadCallbacks {
  onProgress: (fraction: number) => void;
  /** Miniatura local (object URL) para mostrarla mientras se sube. */
  onPreview?: (objectUrl: string) => void;
  signal: AbortSignal;
}

export class UploadAbortedError extends Error {
  constructor() {
    super("Subida cancelada");
    this.name = "UploadAbortedError";
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "No se pudo completar la operación", res.status);
  return data as T;
}

function putFile(
  instr: Extract<UploadInstructions, { protocol: "single" }>,
  file: File,
  cb: UploadCallbacks,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(instr.method, instr.url);
    for (const [k, v] of Object.entries(instr.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && cb.onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`La subida falló (código ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Error de red durante la subida"));
    xhr.onabort = () => reject(new UploadAbortedError());
    cb.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

async function resumableUpload(
  instr: Extract<UploadInstructions, { protocol: "resumable" }>,
  file: File,
  cb: UploadCallbacks,
): Promise<void> {
  // Carga diferida: el bundle del dashboard no incluye tus-js-client hasta que hace falta.
  const { Upload } = await import("tus-js-client");
  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      uploadUrl: instr.url, // sesión ya creada por el backend
      chunkSize: instr.chunkSizeBytes,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => cb.onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (err) => reject(new Error(err.message || "La subida falló")),
    });
    cb.signal.addEventListener(
      "abort",
      () => {
        void upload.abort();
        reject(new UploadAbortedError());
      },
      { once: true },
    );
    upload.start();
  });
}

/** Sube la miniatura capturada. Es "best effort": si falla, se usa el respaldo. */
async function putThumbnail(instr: ThumbnailUploadInstructions, blob: Blob, signal: AbortSignal) {
  if (blob.size > instr.maxBytes) return false;
  try {
    const res = await fetch(instr.url, { method: instr.method, headers: instr.headers, body: blob, signal });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Flujo completo: analizar en local (duración + miniatura) → pedir ticket →
 * subir directo al almacenamiento (video y miniatura en paralelo) → confirmar.
 * Devuelve el video ya registrado (DTO público).
 */
export async function uploadVideo(
  file: File,
  title: string,
  folderId: string | null,
  cb: UploadCallbacks,
): Promise<PublicVideo> {
  const { durationSec, thumbnail } = await probeVideo(file);
  if (thumbnail) cb.onPreview?.(URL.createObjectURL(thumbnail));

  const { videoId, upload, thumbnailUpload } = await api<{
    videoId: string;
    upload: UploadInstructions;
    thumbnailUpload?: ThumbnailUploadInstructions;
  }>("/api/videos/upload-url", {
    title,
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: file.type || "video/mp4",
    folderId,
  });

  const thumbTask =
    thumbnail && thumbnailUpload
      ? putThumbnail(thumbnailUpload, thumbnail, cb.signal)
      : Promise.resolve(false);

  if (upload.protocol === "single") await putFile(upload, file, cb);
  else await resumableUpload(upload, file, cb);
  cb.onProgress(1);
  const hasThumbnail = await thumbTask;

  // El proveedor puede tardar un instante en reflejar la subida (409 → reintento).
  for (let attempt = 1; ; attempt++) {
    try {
      const { video } = await api<{ video: PublicVideo }>("/api/videos/confirm", {
        videoId,
        durationSec,
        hasThumbnail,
      });
      return video;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409 || attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}
