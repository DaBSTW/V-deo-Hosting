/**
 * ============================================================================
 *  VideoProviderAdapter — punto de abstracción central de la plataforma
 * ============================================================================
 *
 *  Todo el resto del sistema (API, dashboard, embed, workers) habla con el
 *  almacenamiento de video EXCLUSIVAMENTE a través de esta interfaz. Ningún
 *  módulo fuera de `src/server/video-providers/` conoce R2, S3 o Stream.
 *
 *  Patrón Strategy: cada proveedor es una estrategia intercambiable; la
 *  fábrica (`factory.ts`) decide cuál usar en función de `VIDEO_PROVIDER`
 *  (para subidas nuevas) o del campo `provider` guardado en cada video
 *  (para reproducir / borrar videos existentes).
 */

/** Debe coincidir con el enum `MediaProvider` de Prisma. */
export type ProviderName = "R2" | "STREAM";

/** Estado del video tal y como lo entiende la plataforma (agnóstico). */
export type ProviderVideoStatus = "PENDING_UPLOAD" | "PROCESSING" | "READY" | "ERROR";

/** Metadatos privados que el adaptador quiera persistir junto al video. */
export type ProviderMeta = Record<string, string | number | boolean | null>;

/** Referencia mínima que un adaptador necesita para operar sobre un video. */
export interface ProviderVideoRef {
  providerVideoId: string;
  providerMeta: ProviderMeta | null;
  mimeType: string | null;
}

export interface UploadRequest {
  /** Nuestro id público; útil como etiqueta en el proveedor, nunca al revés. */
  publicId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Instrucciones de subida que viajan al navegador. Son deliberadamente
 * genéricas: el cliente solo sabe "haz un PUT a esta URL" o "usa subida
 * reanudable contra esta URL". No hay credenciales ni nombres de proveedor.
 */
export type UploadInstructions =
  | {
      protocol: "single";
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      expiresAt: string;
    }
  | {
      protocol: "resumable";
      url: string;
      chunkSizeBytes: number;
      expiresAt: string;
    };

/** Subida de la miniatura que el navegador extrae del propio archivo. */
export interface ThumbnailUploadInstructions {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  maxBytes: number;
}

export interface UploadTicket {
  /** Id interno del proveedor (object key / uid). Se guarda solo en la DB. */
  providerVideoId: string;
  providerMeta?: ProviderMeta;
  instructions: UploadInstructions;
  /**
   * Solo si el proveedor NO genera miniaturas por sí mismo: el navegador
   * captura un fotograma y lo sube aquí (cero CPU en el VPS).
   */
  thumbnail?: ThumbnailUploadInstructions;
}

export interface ProviderVideoState {
  status: ProviderVideoStatus;
  durationSec?: number | null;
  sizeBytes?: number | null;
  /** Motivo técnico (solo logs / DB, nunca UI). */
  errorReason?: string | null;
  /** Se fusiona con `providerMeta` existente. */
  providerMeta?: ProviderMeta;
  /** Solicita post-procesado en segundo plano (p. ej. generar HLS). */
  postProcess?: boolean;
  /** Hay miniatura disponible para este video. */
  hasThumbnail?: boolean;
}

export interface PlaybackSource {
  kind: "hls" | "mp4";
  url: string;
  mimeType: string;
  posterUrl?: string | null;
  /** ISO-8601; las URLs firmadas caducan. */
  expiresAt?: string | null;
}

/**
 * Resultado de pedir una descarga. Algunos proveedores generan el MP4
 * descargable de forma asíncrona (`preparing`).
 */
export type DownloadResult =
  | { status: "ready"; url: string }
  | { status: "preparing" }
  | { status: "unavailable"; reason?: string };

/** Una calidad descargable (p. ej. "Original", "720p"). */
export interface DownloadOption {
  /** Identificador opaco para pedirla (`original`, `720`, `default`…). */
  id: string;
  label: string;
  height?: number | null;
  sizeBytes?: number | null;
}

export interface ConfirmHints {
  /** Tamaño declarado por el cliente al pedir la URL de subida. */
  declaredSizeBytes: number;
  /** Duración leída en el navegador (orientativa; el proveedor manda). */
  clientDurationSec?: number | null;
  maxSizeBytes: number;
  /** El navegador dice haber subido una miniatura (el adaptador la verifica). */
  clientThumbnail?: boolean;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
}

/** Eventos normalizados que un webhook puede producir. */
export type WebhookEvent =
  | { type: "upload.completed"; providerVideoId: string }
  | { type: "state.changed"; providerVideoId: string; state: ProviderVideoState };

export interface VideoProviderAdapter {
  readonly name: ProviderName;

  /** Emite un ticket de subida directa cliente → proveedor (no pasa por el VPS). */
  getUploadUrl(req: UploadRequest): Promise<UploadTicket>;

  /**
   * Verifica en el proveedor que la subida existe y es válida. Devuelve el
   * estado resultante (READY / PROCESSING / ERROR / PENDING_UPLOAD si aún no llegó).
   */
  confirmUpload(ref: ProviderVideoRef, hints: ConfirmHints): Promise<ProviderVideoState>;

  /** Consulta activa del estado (fallback cuando no llegan webhooks). */
  getStatus(ref: ProviderVideoRef): Promise<ProviderVideoState>;

  /** URL de reproducción (posiblemente firmada y con caducidad). */
  getPlaybackUrl(ref: ProviderVideoRef): Promise<PlaybackSource>;

  /**
   * URL de descarga DIRECTA desde el proveedor (firmada, con
   * `Content-Disposition: attachment`). El VPS solo redirige: no transfiere bytes.
   */
  getDownloadUrl(ref: ProviderVideoRef, baseName: string, optionId: string): Promise<DownloadResult>;

  /**
   * Calidades descargables, calculadas SOLO con los metadatos guardados
   * (sin llamadas de red). La primera es la opción por defecto.
   */
  listDownloadOptions(ref: ProviderVideoRef, originalSizeBytes: number): DownloadOption[];

  /** Hook opcional cuando un video pasa a READY (p. ej. preparar la descarga). */
  onReady?(ref: ProviderVideoRef): Promise<void>;

  /** Elimina todos los archivos remotos del video. Idempotente. */
  deleteVideo(ref: ProviderVideoRef): Promise<void>;

  /**
   * Procesa un webhook entrante. Devuelve `null` si la petición NO pertenece a
   * este proveedor (permite un único endpoint genérico). Lanza
   * `WebhookAuthError` si pertenece pero la firma no es válida.
   */
  handleWebhook(req: WebhookRequest): Promise<WebhookEvent[] | null>;
}
