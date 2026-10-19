/**
 * Adaptador Cloudflare Stream.
 *
 *  - Subida: "Direct Creator Upload" con protocolo TUS (reanudable). El backend
 *    crea la sesión TUS con su token de API y entrega al navegador solo la URL
 *    de subida de un solo uso (sin credenciales).
 *  - Procesado: Stream transcodifica y emite un webhook (`ready` / `error`).
 *    Si no hay webhook configurado, `getStatus` sirve de fallback por sondeo.
 *  - Reproducción: HLS adaptativo. Con `requireSignedURLs` se genera un token
 *    firmado (localmente con la clave de firma, o vía API como alternativa).
 */
import { importJWK, SignJWT, type CryptoKey, type KeyObject } from "jose";
import { getCoreEnv, getStreamEnv } from "@/lib/env";
import { ProviderError, WebhookAuthError } from "./errors";
import { hmacSha256Hex, safeEqualHex } from "./hmac";
import type {
  ConfirmHints,
  PlaybackSource,
  ProviderVideoRef,
  ProviderVideoState,
  UploadRequest,
  UploadTicket,
  VideoProviderAdapter,
  WebhookEvent,
  WebhookRequest,
} from "./types";

const TUS_CHUNK_SIZE = 50 * 1024 * 1024; // múltiplo de 256 KiB, mínimo 5 MiB
const UPLOAD_SESSION_TTL_SEC = 6 * 3600;
const WEBHOOK_TOLERANCE_SEC = 15 * 60;
const UID_RE = /^[0-9a-f]{32}$/;

/** Subconjunto del objeto "video" de la API de Stream que nos interesa. */
interface StreamVideo {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string };
  duration?: number;
  size?: number;
  input?: { width?: number; height?: number };
}

interface ApiEnvelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

export class CloudflareStreamAdapter implements VideoProviderAdapter {
  readonly name = "STREAM" as const;
  private readonly env = getStreamEnv();
  private signingKey?: Promise<CryptoKey | KeyObject | Uint8Array>;

  private get baseUrl() {
    return `${this.env.CF_API_BASE_URL}/accounts/${this.env.CF_ACCOUNT_ID}/stream`;
  }

  // -------------------------------------------------------------------------
  async getUploadUrl(req: UploadRequest): Promise<UploadTicket> {
    const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64");
    const expiry = new Date(Date.now() + UPLOAD_SESSION_TTL_SEC * 1000).toISOString();

    // Etiquetamos el video en Stream con NUESTRO publicId (no con datos del usuario).
    const metadata = [
      `name ${b64(req.publicId)}`,
      `maxDurationSeconds ${b64(String(this.env.CF_STREAM_MAX_DURATION_SEC))}`,
      `expiry ${b64(expiry)}`,
      ...(this.env.CF_STREAM_REQUIRE_SIGNED_URLS ? ["requiresignedurls"] : []),
    ].join(",");

    const res = await this.fetchRaw(`${this.baseUrl}?direct_user=true`, {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(req.sizeBytes),
        "Upload-Metadata": metadata,
      },
    });

    const location = res.headers.get("location");
    const uid = res.headers.get("stream-media-id") ?? location?.split("?")[0].split("/").pop();
    if (!res.ok || !location || !uid) {
      throw new ProviderError(
        `Stream: no se pudo crear la sesión TUS (HTTP ${res.status}): ${await safeText(res)}`,
      );
    }

    return {
      providerVideoId: uid,
      instructions: {
        protocol: "resumable",
        url: location,
        chunkSizeBytes: TUS_CHUNK_SIZE,
        expiresAt: expiry,
      },
    };
  }

  // -------------------------------------------------------------------------
  async confirmUpload(ref: ProviderVideoRef, hints: ConfirmHints): Promise<ProviderVideoState> {
    const state = await this.getStatus(ref);
    if (state.sizeBytes && state.sizeBytes > hints.maxSizeBytes) {
      await this.deleteVideo(ref);
      return { status: "ERROR", errorReason: `Tamaño excedido (${state.sizeBytes})` };
    }
    // Stream no conoce el tamaño hasta procesar; usamos el declarado mientras tanto.
    return { ...state, sizeBytes: state.sizeBytes || hints.declaredSizeBytes };
  }

  // -------------------------------------------------------------------------
  async getStatus(ref: ProviderVideoRef): Promise<ProviderVideoState> {
    const res = await this.fetchRaw(`${this.baseUrl}/${this.uid(ref)}`, { method: "GET" });
    if (res.status === 404) {
      return { status: "ERROR", errorReason: "El video no existe en el proveedor" };
    }
    const body = await this.parse<StreamVideo>(res, "get video");
    return mapStreamVideo(body);
  }

  // -------------------------------------------------------------------------
  async getPlaybackUrl(ref: ProviderVideoRef): Promise<PlaybackSource> {
    const uid = this.uid(ref);
    const host = `https://${this.env.CF_STREAM_DELIVERY_HOST}`;
    const ttl = getCoreEnv().PLAYBACK_URL_TTL_SEC;
    const exp = Math.floor(Date.now() / 1000) + ttl;

    // Con URLs firmadas, el token sustituye al uid en la ruta: el uid real
    // nunca aparece en el HTML del embed.
    const id = this.env.CF_STREAM_REQUIRE_SIGNED_URLS ? await this.playbackToken(uid, exp) : uid;

    return {
      kind: "hls",
      url: `${host}/${id}/manifest/video.m3u8`,
      mimeType: "application/vnd.apple.mpegurl",
      posterUrl: `${host}/${id}/thumbnails/thumbnail.jpg?time=2s&height=720`,
      expiresAt: this.env.CF_STREAM_REQUIRE_SIGNED_URLS ? new Date(exp * 1000).toISOString() : null,
    };
  }

  // -------------------------------------------------------------------------
  async deleteVideo(ref: ProviderVideoRef): Promise<void> {
    const res = await this.fetchRaw(`${this.baseUrl}/${this.uid(ref)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new ProviderError(`Stream: borrado falló (HTTP ${res.status}): ${await safeText(res)}`, {
        retryable: res.status >= 500,
      });
    }
  }

  // -------------------------------------------------------------------------
  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent[] | null> {
    const header = req.headers.get("webhook-signature");
    if (!header) return null; // no es un webhook de Stream

    const secret = this.env.CF_STREAM_WEBHOOK_SECRET;
    const parts = Object.fromEntries(
      header.split(",").map((kv) => kv.split("=", 2).map((s) => s.trim()) as [string, string]),
    );
    const time = Number(parts.time);
    const age = Math.abs(Date.now() / 1000 - time);

    if (
      !secret ||
      !parts.sig1 ||
      !Number.isFinite(time) ||
      age > WEBHOOK_TOLERANCE_SEC ||
      !safeEqualHex(parts.sig1, hmacSha256Hex(secret, `${parts.time}.${req.rawBody}`))
    ) {
      throw new WebhookAuthError();
    }

    const video = JSON.parse(req.rawBody) as StreamVideo;
    if (!video?.uid || !UID_RE.test(video.uid)) return [];
    return [{ type: "state.changed", providerVideoId: video.uid, state: mapStreamVideo(video) }];
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------
  private uid(ref: ProviderVideoRef): string {
    if (!UID_RE.test(ref.providerVideoId)) {
      throw new ProviderError(`uid de Stream inválido: ${ref.providerVideoId}`);
    }
    return ref.providerVideoId;
  }

  /** Token de reproducción firmado (RS256 local o, como alternativa, vía API). */
  private async playbackToken(uid: string, exp: number): Promise<string> {
    const { CF_STREAM_SIGNING_KEY_ID: kid, CF_STREAM_SIGNING_KEY_JWK: jwkB64 } = this.env;

    if (kid && jwkB64) {
      // Firma local: sin llamada de red por cada reproducción (recomendado).
      this.signingKey ??= importJWK(
        JSON.parse(Buffer.from(jwkB64, "base64").toString("utf8")),
        "RS256",
      );
      return new SignJWT({ kid })
        .setProtectedHeader({ alg: "RS256", kid })
        .setSubject(uid)
        .setNotBefore(Math.floor(Date.now() / 1000) - 60)
        .setExpirationTime(exp)
        .sign(await this.signingKey);
    }

    const res = await this.fetchRaw(`${this.baseUrl}/${uid}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exp }),
    });
    const { token } = await this.parse<{ token: string }>(res, "token");
    return token;
  }

  private async fetchRaw(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.env.CF_STREAM_API_TOKEN}`, ...init.headers },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderError("Stream: error de red", { cause: err, retryable: true });
    }
  }

  private async parse<T>(res: Response, op: string): Promise<T> {
    const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
      throw new ProviderError(`Stream ${op} falló (HTTP ${res.status}) ${detail ?? ""}`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    return body.result;
  }
}

/** Traduce los estados de Stream al vocabulario agnóstico de la plataforma. */
function mapStreamVideo(v: StreamVideo): ProviderVideoState {
  const state = v.status?.state;
  const duration = typeof v.duration === "number" && v.duration > 0 ? v.duration : null;
  const size = typeof v.size === "number" && v.size > 0 ? v.size : null;

  if (state === "error") {
    return {
      status: "ERROR",
      errorReason: [v.status?.errorReasonCode, v.status?.errorReasonText].filter(Boolean).join(": "),
    };
  }
  if (state === "pendingupload") return { status: "PENDING_UPLOAD" };
  if (v.readyToStream && state === "ready") {
    return { status: "READY", durationSec: duration, sizeBytes: size };
  }
  // queued | downloading | inprogress | ready-sin-readyToStream
  return { status: "PROCESSING", durationSec: duration, sizeBytes: size };
}

async function safeText(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 500);
}
