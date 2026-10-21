/**
 * Adaptador Cloudflare R2 (API compatible con S3).
 *
 *  - Subida: URL prefirmada `PUT` → el navegador sube directo al bucket. Los
 *    archivos grandes (≥ R2_MULTIPART_THRESHOLD_MB) van por partes (multipart):
 *    el navegador sube varias partes en paralelo con URLs firmadas que pide por
 *    lotes, y al confirmar el backend lista las partes y completa el objeto.
 *  - Reproducción:
 *      a) `R2_PUBLIC_BASE_URL` (dominio propio conectado al bucket): sirve el
 *         archivo / HLS desde tu dominio con la caché de Cloudflare.
 *      b) Sin dominio propio: URL prefirmada `GET` de corta duración.
 *  - Miniaturas (sin CPU en el VPS):
 *      1) El navegador captura un fotograma del archivo local con <canvas> y lo
 *         sube a `poster.jpg` con una segunda URL prefirmada.
 *      2) Respaldo opcional: Cloudflare Media Transformations extrae un
 *         fotograma en el edge (`R2_MEDIA_TRANSFORMATIONS=true`).
 *      3) El worker HLS (si está activo) regenera la miniatura con ffmpeg.
 *  - HLS opcional: si `R2_HLS_ENABLED=true`, el video queda READY al instante
 *    (reproducción progresiva MP4) y el worker `scripts/hls-worker.ts` genera
 *    en segundo plano un HLS multi-calidad; al terminar, `providerMeta.hls`
 *    pasa a `true` y el reproductor cambia a HLS automáticamente.
 *  - Webhooks: R2 publica eventos en una Queue; el Worker de
 *    `workers/r2-event-forwarder` los reenvía firmados (HMAC) a nuestra API.
 *
 *  Estructura de claves (opaca, sin datos del usuario):
 *    videos/<token>/source.<ext>     archivo original
 *    videos/<token>/hls/master.m3u8  HLS (opcional)
 *    videos/<token>/poster.jpg       miniatura (opcional)
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  type Part,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCoreEnv, getR2Env } from "#srv/env";
import { randomToken } from "#shared/lib/ids";
import { attachmentDisposition, safeFileName } from "./download";
import { ProviderError, WebhookAuthError } from "./errors";
import { hmacSha256Hex, safeEqualHex } from "./hmac";
import type {
  ConfirmHints,
  DownloadOption,
  DownloadResult,
  PlaybackSource,
  ProviderVideoRef,
  ProviderVideoState,
  UploadRequest,
  UploadTicket,
  VideoProviderAdapter,
  WebhookEvent,
  WebhookRequest,
} from "./types";

const UPLOAD_URL_TTL_SEC = 60 * 60;
const MiB = 1024 * 1024;
/** Límite de partes de una subida multipart (S3 / R2). */
const MAX_PARTS = 10_000;
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
/** Basta con que la descarga EMPIECE antes de caducar; luego continúa. */
const DOWNLOAD_URL_TTL_SEC = 15 * 60;
const KEY_RE = /^videos\/[0-9A-Za-z]{24}\/source\.[a-z0-9]{2,5}$/;
const SIGNATURE_HEADER = "x-r2-event-signature";

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/ogg": "ogv",
  "video/x-msvideo": "avi",
  "video/mpeg": "mpeg",
  "video/3gpp": "3gp",
};

/** Formato de las notificaciones de eventos de R2 (reenviadas por el Worker). */
interface R2EventNotification {
  action: "PutObject" | "CopyObject" | "CompleteMultipartUpload" | "DeleteObject" | string;
  bucket: string;
  object: { key: string; size?: number; eTag?: string };
  eventTime?: string;
}

export class CloudflareR2Adapter implements VideoProviderAdapter {
  readonly name = "R2" as const;
  private readonly env = getR2Env();
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: "auto",
      endpoint: this.env.R2_ENDPOINT ?? `https://${this.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: !!this.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: this.env.R2_ACCESS_KEY_ID,
        secretAccessKey: this.env.R2_SECRET_ACCESS_KEY,
      },
      // R2 no soporta los checksums CRC por defecto del SDK v3 en URLs
      // prefirmadas; solo se calculan cuando la operación lo exige.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  /** Cliente S3 expuesto solo para workers internos (transcodificación). */
  get client(): S3Client {
    return this.s3;
  }

  get bucket(): string {
    return this.env.R2_BUCKET;
  }

  static folderOf(key: string): string {
    return key.slice(0, key.lastIndexOf("/"));
  }

  // -------------------------------------------------------------------------
  async getUploadUrl(req: UploadRequest): Promise<UploadTicket> {
    const ext = EXT_BY_MIME[req.mimeType] ?? "mp4";
    const key = `videos/${randomToken(24)}/source.${ext}`;

    const presignPut = (Key: string, ContentType: string) =>
      getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.env.R2_BUCKET, Key, ContentType }), {
        expiresIn: UPLOAD_URL_TTL_SEC,
      });

    const thumbUrl = await this.wrap("presign upload", () =>
      presignPut(`${CloudflareR2Adapter.folderOf(key)}/poster.jpg`, "image/jpeg"),
    );
    const thumbnail = {
      method: "PUT" as const,
      url: thumbUrl,
      headers: { "Content-Type": "image/jpeg" },
      maxBytes: THUMBNAIL_MAX_BYTES,
    };

    if (req.sizeBytes >= this.env.R2_MULTIPART_THRESHOLD_MB * MiB) {
      const partSizeBytes = this.partSizeFor(req.sizeBytes);
      const { UploadId } = await this.wrap("create multipart upload", () =>
        this.s3.send(
          new CreateMultipartUploadCommand({ Bucket: this.env.R2_BUCKET, Key: key, ContentType: req.mimeType }),
        ),
      );
      if (!UploadId) throw new ProviderError("R2 no devolvió UploadId");
      return {
        providerVideoId: key,
        // Solo en la DB: el navegador nunca ve el UploadId.
        providerMeta: { uploadId: UploadId, partSize: partSizeBytes },
        instructions: {
          protocol: "multipart",
          partSizeBytes,
          partCount: Math.ceil(req.sizeBytes / partSizeBytes),
        },
        thumbnail,
      };
    }

    const url = await this.wrap("presign upload", () => presignPut(key, req.mimeType));
    return {
      providerVideoId: key,
      instructions: {
        protocol: "single",
        method: "PUT",
        url,
        // Deben coincidir exactamente con los firmados.
        headers: { "Content-Type": req.mimeType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SEC * 1000).toISOString(),
      },
      thumbnail,
    };
  }

  /** Partes de tamaño fijo (R2 lo exige), en MiB enteros y sin pasar de 10 000. */
  private partSizeFor(sizeBytes: number): number {
    const minForCount = Math.ceil(sizeBytes / MAX_PARTS / MiB) * MiB;
    return Math.max(this.env.R2_MULTIPART_PART_MB * MiB, minForCount);
  }

  async getUploadPartUrls(ref: ProviderVideoRef, partNumbers: number[]): Promise<Record<number, string>> {
    const uploadId = multipartIdOf(ref);
    if (!uploadId) throw new ProviderError("El video no tiene una subida por partes en curso");
    const urls = await this.wrap("presign upload part", () =>
      Promise.all(
        partNumbers.map((PartNumber) =>
          getSignedUrl(
            this.s3,
            new UploadPartCommand({ Bucket: this.env.R2_BUCKET, Key: ref.providerVideoId, UploadId: uploadId, PartNumber }),
            { expiresIn: UPLOAD_URL_TTL_SEC },
          ),
        ),
      ),
    );
    return Object.fromEntries(partNumbers.map((n, i) => [n, urls[i]]));
  }

  /**
   * Une las partes subidas por el navegador. Devuelve `false` si aún faltan
   * partes (el cliente reintenta la confirmación). Las ETag se leen de R2 con
   * ListParts, así que el navegador no necesita leer cabeceras de respuesta.
   */
  private async completeMultipart(ref: ProviderVideoRef, uploadId: string, declaredSize: number): Promise<boolean> {
    const partSize = Number(ref.providerMeta?.partSize) || 0;
    const expected = partSize > 0 ? Math.ceil(declaredSize / partSize) : 0;
    const parts: Part[] = [];
    let marker: string | undefined;
    try {
      do {
        const page = await this.s3.send(
          new ListPartsCommand({
            Bucket: this.env.R2_BUCKET,
            Key: ref.providerVideoId,
            UploadId: uploadId,
            PartNumberMarker: marker,
          }),
        );
        parts.push(...(page.Parts ?? []));
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      } while (marker);
    } catch (err) {
      // Subida ya completada (o abortada): el HEAD posterior decide.
      if (err instanceof S3ServiceException && err.name === "NoSuchUpload") return true;
      throw new ProviderError("R2 ListParts falló", { cause: err, retryable: true });
    }

    const byNumber = new Map(parts.map((p) => [p.PartNumber, p]));
    for (let n = 1; n <= expected; n++) {
      const part = byNumber.get(n);
      const want = n < expected ? partSize : declaredSize - partSize * (expected - 1);
      if (!part || Number(part.Size) !== want) return false;
    }
    await this.wrap("complete multipart upload", () =>
      this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.env.R2_BUCKET,
          Key: ref.providerVideoId,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: Array.from({ length: expected }, (_, i) => ({
              PartNumber: i + 1,
              ETag: byNumber.get(i + 1)!.ETag,
            })),
          },
        }),
      ),
    );
    return true;
  }

  private async abortMultipart(ref: ProviderVideoRef): Promise<void> {
    const uploadId = multipartIdOf(ref);
    if (!uploadId) return;
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({ Bucket: this.env.R2_BUCKET, Key: ref.providerVideoId, UploadId: uploadId }),
      );
    } catch {
      // Ya completada o abortada; R2 también aborta sola las incompletas a los 7 días.
    }
  }

  // -------------------------------------------------------------------------
  async confirmUpload(ref: ProviderVideoRef, hints: ConfirmHints): Promise<ProviderVideoState> {
    let head = await this.head(ref.providerVideoId);
    const uploadId = multipartIdOf(ref);
    if (!head && uploadId) {
      if (!(await this.completeMultipart(ref, uploadId, hints.declaredSizeBytes))) return { status: "PENDING_UPLOAD" };
      head = await this.head(ref.providerVideoId);
    }
    if (!head) return { status: "PENDING_UPLOAD" };

    const size = head.size;
    // La URL prefirmada no limita el tamaño: lo validamos aquí y, si el
    // cliente subió más de lo declarado o del máximo, se rechaza.
    if (size <= 0 || size > hints.maxSizeBytes || size !== hints.declaredSizeBytes) {
      await this.deleteVideo(ref);
      return {
        status: "ERROR",
        sizeBytes: size,
        errorReason: `Tamaño inválido (declarado=${hints.declaredSizeBytes}, real=${size})`,
      };
    }

    const poster = hints.clientThumbnail ? await this.verifyClientThumbnail(ref) : false;

    return {
      // Reproducción progresiva inmediata; el HLS (si está activo) llega después.
      status: "READY",
      sizeBytes: size,
      durationSec: sanitizeDuration(hints.clientDurationSec),
      postProcess: this.env.R2_HLS_ENABLED,
      // `uploadId: null`: la subida por partes ya se completó.
      providerMeta: { hls: false, poster, ...(uploadId ? { uploadId: null, partSize: null } : {}) },
      hasThumbnail: poster || this.env.R2_MEDIA_TRANSFORMATIONS,
    };
  }

  /** La miniatura la sube el navegador: comprobamos que exista y sea razonable. */
  private async verifyClientThumbnail(ref: ProviderVideoRef): Promise<boolean> {
    const key = `${CloudflareR2Adapter.folderOf(ref.providerVideoId)}/poster.jpg`;
    const head = await this.head(key);
    if (!head) return false;
    if (head.size > 0 && head.size <= THUMBNAIL_MAX_BYTES && head.contentType === "image/jpeg") {
      return true;
    }
    await this.wrap("delete thumbnail", () =>
      this.s3.send(new DeleteObjectsCommand({ Bucket: this.env.R2_BUCKET, Delete: { Objects: [{ Key: key }] } })),
    );
    return false;
  }

  // -------------------------------------------------------------------------
  async getStatus(ref: ProviderVideoRef): Promise<ProviderVideoState> {
    const head = await this.head(ref.providerVideoId);
    if (!head) return { status: "PENDING_UPLOAD" };
    return { status: "READY", sizeBytes: head.size };
  }

  // -------------------------------------------------------------------------
  async getPlaybackUrl(ref: ProviderVideoRef): Promise<PlaybackSource> {
    const key = ref.providerVideoId;
    const folder = CloudflareR2Adapter.folderOf(key);
    const base = this.env.R2_PUBLIC_BASE_URL;
    const ttl = getCoreEnv().PLAYBACK_URL_TTL_SEC;
    const hasPoster = ref.providerMeta?.poster === true;

    if (base) {
      // Miniatura propia si existe; si no, fotograma extraído en el edge.
      const posterUrl = hasPoster
        ? `${base}/${folder}/poster.jpg`
        : this.env.R2_MEDIA_TRANSFORMATIONS
          ? `${base}/cdn-cgi/media/mode=frame,time=1s,width=640,height=360,fit=cover/${key}`
          : null;

      if (ref.providerMeta?.hls === true) {
        return {
          kind: "hls",
          url: `${base}/${folder}/hls/master.m3u8`,
          mimeType: "application/vnd.apple.mpegurl",
          posterUrl,
        };
      }
      return { kind: "mp4", url: `${base}/${key}`, mimeType: playableMime(ref.mimeType), posterUrl };
    }

    const sign = (Key: string, ResponseContentType?: string) =>
      getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.env.R2_BUCKET, Key, ResponseContentType }),
        { expiresIn: ttl },
      );

    const [url, posterUrl] = await this.wrap("presign playback", () =>
      Promise.all([
        sign(key, playableMime(ref.mimeType)),
        hasPoster ? sign(`${folder}/poster.jpg`, "image/jpeg") : Promise.resolve(null),
      ]),
    );

    return {
      kind: "mp4",
      url,
      mimeType: playableMime(ref.mimeType),
      posterUrl,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  /**
   * Descarga del archivo ORIGINAL directamente desde R2. Siempre con URL
   * prefirmada (aunque haya dominio propio) porque así podemos forzar
   * `Content-Disposition: attachment` con el nombre del video.
   */
  async getDownloadUrl(ref: ProviderVideoRef, baseName: string, optionId: string): Promise<DownloadResult> {
    const folder = CloudflareR2Adapter.folderOf(ref.providerVideoId);
    let key: string;
    let fileName: string;
    let contentType: string;

    if (optionId === "original") {
      key = ref.providerVideoId;
      fileName = safeFileName(baseName, CloudflareR2Adapter.extensionOf(key));
      contentType = ref.mimeType ?? "application/octet-stream";
    } else {
      // Solo se aceptan calidades que el worker registró en los metadatos.
      const rendition = renditionsOf(ref).find((r) => String(r.h) === optionId);
      if (!rendition) return { status: "unavailable", reason: "calidad inexistente" };
      key = `${folder}/downloads/${rendition.h}p.mp4`;
      fileName = safeFileName(`${baseName} (${rendition.h}p)`, "mp4");
      contentType = "video/mp4";
    }

    const url = await this.wrap("presign download", () =>
      getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.env.R2_BUCKET,
          Key: key,
          ResponseContentDisposition: attachmentDisposition(fileName),
          ResponseContentType: contentType,
        }),
        { expiresIn: DOWNLOAD_URL_TTL_SEC },
      ),
    );
    return { status: "ready", url };
  }

  listDownloadOptions(ref: ProviderVideoRef, originalSizeBytes: number): DownloadOption[] {
    const sourceHeight = Number(ref.providerMeta?.sourceHeight) || null;
    return [
      {
        id: "original",
        kind: "original",
        height: sourceHeight,
        sizeBytes: originalSizeBytes,
      },
      ...renditionsOf(ref).map((r) => ({ id: String(r.h), kind: "rendition" as const, height: r.h, sizeBytes: r.bytes })),
    ];
  }

  /** Extensión del archivo original (para nombrar la descarga). */
  static extensionOf(key: string): string {
    return key.slice(key.lastIndexOf(".") + 1) || "mp4";
  }

  // -------------------------------------------------------------------------
  async deleteVideo(ref: ProviderVideoRef): Promise<void> {
    const prefix = `${CloudflareR2Adapter.folderOf(ref.providerVideoId)}/`;
    if (!prefix.startsWith("videos/")) {
      throw new ProviderError(`Clave de objeto inesperada: ${ref.providerVideoId}`);
    }

    await this.abortMultipart(ref);
    await this.wrap("delete", async () => {
      let token: string | undefined;
      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.env.R2_BUCKET,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (objects.length > 0) {
          await this.s3.send(
            new DeleteObjectsCommand({
              Bucket: this.env.R2_BUCKET,
              Delete: { Objects: objects, Quiet: true },
            }),
          );
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    });
  }

  // -------------------------------------------------------------------------
  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent[] | null> {
    const signature = req.headers.get(SIGNATURE_HEADER);
    if (!signature) return null; // no es para este adaptador

    const secret = this.env.R2_WEBHOOK_SECRET;
    if (!secret || !safeEqualHex(signature, hmacSha256Hex(secret, req.rawBody))) {
      throw new WebhookAuthError();
    }

    const body = JSON.parse(req.rawBody) as
      | { events: R2EventNotification[] }
      | R2EventNotification;
    const events = "events" in body ? body.events : [body];

    return events.flatMap<WebhookEvent>((e) => {
      if (e.bucket && e.bucket !== this.env.R2_BUCKET) return [];
      if (!KEY_RE.test(e.object?.key ?? "")) return []; // HLS, posters, etc.
      if (["PutObject", "CopyObject", "CompleteMultipartUpload"].includes(e.action)) {
        return [{ type: "upload.completed", providerVideoId: e.object.key }];
      }
      if (e.action === "DeleteObject") {
        return [
          {
            type: "state.changed",
            providerVideoId: e.object.key,
            state: { status: "ERROR", errorReason: "Archivo eliminado del almacenamiento" },
          },
        ];
      }
      return [];
    });
  }

  // -------------------------------------------------------------------------
  private async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.env.R2_BUCKET, Key: key }),
      );
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
      throw new ProviderError("R2 HeadObject falló", { cause: err, retryable: true });
    }
  }

  private async wrap<T>(op: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`R2 ${op} falló`, { cause: err, retryable: true });
    }
  }
}

/** UploadId de una subida por partes aún sin completar (solo en la DB). */
function multipartIdOf(ref: ProviderVideoRef): string | null {
  const id = ref.providerMeta?.uploadId;
  return typeof id === "string" && id ? id : null;
}

/** Calidades MP4 descargables generadas por el worker (`providerMeta.downloads`). */
function renditionsOf(ref: ProviderVideoRef): { h: number; bytes: number }[] {
  const raw = ref.providerMeta?.downloads;
  if (typeof raw !== "string") return [];
  try {
    const list = JSON.parse(raw) as { h: number; bytes: number }[];
    return list.filter((r) => Number.isInteger(r.h) && r.h > 0).sort((a, b) => b.h - a.h);
  } catch {
    return [];
  }
}

function sanitizeDuration(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 7 * 24 * 3600 ? v : null;
}

/** Los navegadores reproducen .mov (H.264) como mp4; evitamos MIME exóticos. */
function playableMime(mime: string | null): string {
  if (!mime || mime === "video/quicktime") return "video/mp4";
  return mime;
}
