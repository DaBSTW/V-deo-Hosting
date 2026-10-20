/**
 * Configuración del servidor validada con Zod.
 *
 * Cada bloque (core / R2 / Stream) se valida de forma perezosa: un despliegue
 * que solo usa R2 no necesita credenciales de Stream y viceversa. Si falta una
 * variable, el error aparece en el log del servidor (nunca en la UI).
 *
 * IMPORTANTE: este módulo solo debe importarse desde código de servidor.
 */
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined))
  .transform((v) => v?.replace(/\/+$/, ""));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

export class ConfigError extends Error {
  constructor(section: string, issues: string) {
    super(`[config:${section}] Configuración inválida → ${issues}`);
    this.name = "ConfigError";
  }
}

function parse<T extends z.ZodType>(section: string, schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(section, issues);
  }
  return result.data;
}

function memo<T>(fn: () => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= fn());
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
const coreSchema = z.object({
  APP_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, "")),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  /** Interruptor global del proveedor de medios para NUEVAS subidas. */
  VIDEO_PROVIDER: z.enum(["R2", "STREAM"]).default("R2"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(5000),
  /** Validez de las URLs de reproducción firmadas (segundos). */
  PLAYBACK_URL_TTL_SEC: z.coerce.number().int().min(60).default(6 * 3600),
  /** Orígenes autorizados a incrustar el reproductor (`*` = cualquiera). */
  EMBED_ALLOWED_ORIGINS: z.string().default("*"),
  ALLOW_REGISTRATION: bool(true),
  /** Interruptor global de descargas (además del permiso por video). */
  ALLOW_DOWNLOADS: bool(true),
  /** Cuota de almacenamiento por usuario en GB (0 = sin límite). */
  STORAGE_QUOTA_GB: z.coerce.number().min(0).default(0),
});
export const getCoreEnv = memo(() => parse("core", coreSchema));

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3 compatible)
// ---------------------------------------------------------------------------
const r2Schema = z
  .object({
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    /** Solo para pruebas locales (MinIO) o jurisdicciones (eu.r2...). */
    R2_ENDPOINT: optionalUrl,
    /** Dominio propio conectado al bucket, p. ej. https://media.midominio.com */
    R2_PUBLIC_BASE_URL: optionalUrl,
    /**
     * Miniaturas de respaldo con Cloudflare Media Transformations (extracción
     * de fotogramas en el edge). Requiere R2_PUBLIC_BASE_URL en una zona con
     * Transformations activado.
     */
    R2_MEDIA_TRANSFORMATIONS: bool(false),
    /** Activa la generación de HLS multi-calidad con el worker (ffmpeg). */
    R2_HLS_ENABLED: bool(false),
    /**
     * Además del HLS, deja un MP4 por calidad para descargar. Se obtiene
     * re-empaquetando (`-c copy`) lo ya codificado: CPU casi nula, pero
     * ocupa espacio extra en R2.
     */
    R2_HLS_DOWNLOAD_RENDITIONS: bool(true),
    /** Secreto HMAC del Worker que reenvía las notificaciones de eventos R2. */
    R2_WEBHOOK_SECRET: optionalString,
  })
  .refine((v) => !v.R2_HLS_ENABLED || !!v.R2_PUBLIC_BASE_URL, {
    message:
      "R2_HLS_ENABLED=true requiere R2_PUBLIC_BASE_URL (los segmentos HLS no pueden firmarse uno a uno)",
    path: ["R2_PUBLIC_BASE_URL"],
  })
  .refine((v) => !v.R2_MEDIA_TRANSFORMATIONS || !!v.R2_PUBLIC_BASE_URL, {
    message: "R2_MEDIA_TRANSFORMATIONS=true requiere R2_PUBLIC_BASE_URL",
    path: ["R2_PUBLIC_BASE_URL"],
  });
export const getR2Env = memo(() => parse("r2", r2Schema));
export const isR2Configured = () => !!process.env.R2_ACCOUNT_ID && !!process.env.R2_BUCKET;

// ---------------------------------------------------------------------------
// Cloudflare Stream
// ---------------------------------------------------------------------------
const streamSchema = z.object({
  CF_ACCOUNT_ID: z.string().min(1),
  CF_STREAM_API_TOKEN: z.string().min(1),
  /** Host de entrega, p. ej. customer-abc123xyz.cloudflarestream.com */
  CF_STREAM_DELIVERY_HOST: z
    .string()
    .min(1)
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/+$/, "")),
  CF_STREAM_WEBHOOK_SECRET: optionalString,
  CF_STREAM_REQUIRE_SIGNED_URLS: bool(true),
  /** Clave de firma (POST /stream/keys). Si falta, se pide un token a la API. */
  CF_STREAM_SIGNING_KEY_ID: optionalString,
  /** Campo `jwk` (base64) devuelto al crear la clave de firma. */
  CF_STREAM_SIGNING_KEY_JWK: optionalString,
  CF_STREAM_MAX_DURATION_SEC: z.coerce.number().int().positive().default(4 * 3600),
  /** Solo para pruebas (mock de la API). */
  CF_API_BASE_URL: z
    .string()
    .url()
    .default("https://api.cloudflare.com/client/v4")
    .transform((v) => v.replace(/\/+$/, "")),
});
export const getStreamEnv = memo(() => parse("stream", streamSchema));
export const isStreamConfigured = () =>
  !!process.env.CF_ACCOUNT_ID && !!process.env.CF_STREAM_API_TOKEN;
