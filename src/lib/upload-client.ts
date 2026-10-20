/**
 * Cliente de subida agnóstico (navegador).
 *
 * El frontend no sabe a qué proveedor sube: recibe del backend unas
 * instrucciones genéricas (`single` = un PUT, `resumable` = protocolo TUS,
 * `multipart` = partes en paralelo con URLs que se piden por lotes) y las ejecuta. Cambiar de proveedor en el .env no requiere tocar este código.
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

/** Error de subida con código traducible (`upload.errors.<code>`). */
export class UploadError extends Error {
  constructor(
    readonly code: "failedStatus" | "network" | "failed" | "requestFailed",
    readonly values?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "UploadError";
  }
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
  // El servidor ya devuelve el mensaje traducido al idioma del usuario.
  if (!res.ok) throw data.error ? new ApiError(data.error, res.status) : new UploadError("requestFailed");
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
        : reject(new UploadError("failedStatus", { status: xhr.status }));
    xhr.onerror = () => reject(new UploadError("network"));
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
      onError: () => reject(new UploadError("failed")),
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

const PART_CONCURRENCY = 4;
const PART_URL_BATCH = 20;
const PART_RETRY_DELAYS_MS = [1000, 3000, 5000, 10000, 20000, 30000];

/** PUT de una parte. Devuelve el código HTTP (0 = error de red). */
function putPart(
  url: string,
  blob: Blob,
  onLoaded: (bytes: number) => void,
  xhrs: Set<XMLHttpRequest>,
): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhrs.add(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    const done = (status: number) => {
      xhrs.delete(xhr);
      resolve(status);
    };
    xhr.onload = () => done(xhr.status);
    xhr.onerror = () => done(0);
    xhr.onabort = () => done(-1);
    xhr.send(blob);
  });
}

/**
 * Subida por partes (archivos grandes, p. ej. 20 GB): varias partes en
 * paralelo, cada una con sus reintentos, sin cargar el archivo en memoria
 * (`File.slice` es perezoso). Las URLs se piden por lotes justo antes de
 * usarlas, así no caducan aunque la subida dure horas.
 */
async function multipartUpload(
  videoId: string,
  instr: Extract<UploadInstructions, { protocol: "multipart" }>,
  file: File,
  cb: UploadCallbacks,
): Promise<void> {
  const { partSizeBytes, partCount } = instr;
  const urls = new Map<number, string>();
  const loaded = new Map<number, number>();
  const xhrs = new Set<XMLHttpRequest>();
  let pendingBatch: Promise<void> | null = null;
  let nextPart = 1;
  let failure: unknown = null;

  const report = () => {
    let sum = 0;
    for (const b of loaded.values()) sum += b;
    cb.onProgress(Math.min(1, sum / file.size));
  };
  const onAbort = () => xhrs.forEach((x) => x.abort());
  cb.signal.addEventListener("abort", onAbort, { once: true });
  const checkAbort = () => {
    if (cb.signal.aborted) throw new UploadAbortedError();
    if (failure) throw failure; // otra parte falló sin remedio: se para todo
  };

  const urlFor = async (n: number): Promise<string> => {
    while (!urls.has(n)) {
      pendingBatch ??= (async () => {
        const parts: number[] = [];
        for (let k = n; k <= partCount && parts.length < PART_URL_BATCH; k++) if (!urls.has(k)) parts.push(k);
        const res = await api<{ urls: Record<string, string> }>("/api/videos/upload-parts", { videoId, parts });
        for (const [k, u] of Object.entries(res.urls)) urls.set(Number(k), u);
      })().finally(() => (pendingBatch = null));
      await pendingBatch;
    }
    return urls.get(n)!;
  };

  const uploadPart = async (n: number) => {
    const start = (n - 1) * partSizeBytes;
    const blob = file.slice(start, Math.min(start + partSizeBytes, file.size));
    for (let attempt = 0; ; attempt++) {
      checkAbort();
      let status = 0;
      try {
        status = await putPart(await urlFor(n), blob, (b) => (loaded.set(n, b), report()), xhrs);
      } catch (err) {
        if (err instanceof ApiError && err.status < 500 && err.status !== 429) throw err;
      }
      checkAbort();
      if (status >= 200 && status < 300) {
        loaded.set(n, blob.size);
        report();
        return;
      }
      loaded.set(n, 0);
      // 403 = URL caducada: se pide otra. Otros 4xx (salvo 408/429) no se arreglan reintentando.
      if (status === 403) urls.delete(n);
      else if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw new UploadError("failedStatus", { status });
      }
      if (attempt >= PART_RETRY_DELAYS_MS.length) {
        throw status ? new UploadError("failedStatus", { status }) : new UploadError("network");
      }
      await new Promise((r) => setTimeout(r, PART_RETRY_DELAYS_MS[attempt]));
    }
  };

  const worker = async () => {
    while (!failure && nextPart <= partCount) {
      const n = nextPart++;
      try {
        await uploadPart(n);
      } catch (err) {
        failure ??= err;
        onAbort(); // corta las demás partes en curso
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, worker));
  } finally {
    cb.signal.removeEventListener("abort", onAbort);
  }
  if (cb.signal.aborted) throw new UploadAbortedError();
  if (failure) throw failure;
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
  else if (upload.protocol === "multipart") await multipartUpload(videoId, upload, file, cb);
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
