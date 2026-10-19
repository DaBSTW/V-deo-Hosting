/**
 * Cliente de subida agnóstico (navegador).
 *
 * El frontend no sabe a qué proveedor sube: recibe del backend unas
 * instrucciones genéricas (`single` = un PUT, `resumable` = protocolo TUS) y
 * las ejecuta. Cambiar de proveedor en el .env no requiere tocar este código.
 */
import type { UploadInstructions } from "@/server/video-providers/types";
import type { PublicVideo } from "@/server/videos/dto";

export interface UploadCallbacks {
  onProgress: (fraction: number) => void;
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

/** Lee la duración en el navegador (orientativa) sin subir nada. */
export function probeDuration(file: File, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
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

/**
 * Flujo completo: pedir ticket → subir directo al almacenamiento → confirmar.
 * Devuelve el video ya registrado (DTO público).
 */
export async function uploadVideo(
  file: File,
  title: string,
  cb: UploadCallbacks,
): Promise<PublicVideo> {
  const durationSec = await probeDuration(file);

  const { videoId, upload } = await api<{ videoId: string; upload: UploadInstructions }>(
    "/api/videos/upload-url",
    {
      title,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "video/mp4",
    },
  );

  if (upload.protocol === "single") await putFile(upload, file, cb);
  else await resumableUpload(upload, file, cb);
  cb.onProgress(1);

  // El proveedor puede tardar un instante en reflejar la subida (409 → reintento).
  for (let attempt = 1; ; attempt++) {
    try {
      const { video } = await api<{ video: PublicVideo }>("/api/videos/confirm", {
        videoId,
        durationSec,
      });
      return video;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409 || attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}
