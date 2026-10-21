/**
 * Post-procesado HLS para videos alojados en R2 (opcional, R2_HLS_ENABLED=true).
 *
 * Flujo: descarga el original → ffprobe → ffmpeg (escalera multi-calidad
 * H.264/AAC en HLS) → miniatura → sube todo a `videos/<token>/hls/` →
 * marca `providerMeta.hls = true`. Mientras tanto el video ya se reproduce
 * en MP4 progresivo; si algo falla, se mantiene el MP4 (degradación elegante).
 *
 * Requiere `ffmpeg` y `ffprobe` en el PATH del VPS (o del contenedor worker).
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Video } from "@prisma/client";
import { getR2Env } from "#srv/env";
import { prisma } from "#srv/prisma";
import { CloudflareR2Adapter } from "./CloudflareR2Adapter";
import { getAdapter } from "./factory";
import type { ProviderMeta } from "./types";

const LOCK_TTL_MS = 3 * 60 * 60 * 1000;
const LADDER = [
  { height: 1080, videoKbps: 5000, audioKbps: 160 },
  { height: 720, videoKbps: 2800, audioKbps: 128 },
  { height: 480, videoKbps: 1400, audioKbps: 128 },
  { height: 360, videoKbps: 800, audioKbps: 96 },
];

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".jpg": "image/jpeg",
};

/** Reclama y procesa el siguiente trabajo pendiente. Devuelve `false` si no hay. */
export async function processNextHlsJob(log = console): Promise<boolean> {
  const staleLock = new Date(Date.now() - LOCK_TTL_MS);
  const lockFree = { OR: [{ jobLockedAt: null }, { jobLockedAt: { lt: staleLock } }] };
  const candidate = await prisma.video.findFirst({
    where: { provider: "R2", status: "READY", postProcessPending: true, ...lockFree },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return false;

  // Bloqueo optimista: solo un worker gana la carrera.
  const claim = await prisma.video.updateMany({
    where: { id: candidate.id, postProcessPending: true, ...lockFree },
    data: { jobLockedAt: new Date() },
  });
  if (claim.count === 0) return true;

  const started = Date.now();
  log.info(`[hls] procesando ${candidate.publicId}`);
  try {
    const result = await transcode(candidate);
    // No pisamos una miniatura previa (p. ej. la del navegador) si ffmpeg no generó una.
    await finish(
      candidate,
      {
        hls: true,
        sourceHeight: result.sourceHeight,
        ...(result.poster ? { poster: true } : {}),
        ...(result.downloads.length ? { downloads: JSON.stringify(result.downloads) } : {}),
      },
      result.durationSec,
    );
    log.info(`[hls] ${candidate.publicId} listo en ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } catch (err) {
    log.error(`[hls] ${candidate.publicId} falló:`, err);
    await finish(candidate, { hls: false, hlsError: String((err as Error).message).slice(0, 300) });
  }
  return true;
}

async function finish(video: Video, meta: ProviderMeta, durationSec?: number | null) {
  // Puede haberse borrado mientras procesábamos.
  const current = await prisma.video.findUnique({ where: { id: video.id } });
  if (!current) return;
  await prisma.video.update({
    where: { id: video.id },
    data: {
      providerMeta: { ...((current.providerMeta as ProviderMeta | null) ?? {}), ...meta },
      postProcessPending: false,
      jobLockedAt: null,
      hasThumbnail: current.hasThumbnail || meta.poster === true,
      durationSec: durationSec ?? current.durationSec,
    },
  });
}

interface TranscodeResult {
  durationSec: number | null;
  poster: boolean;
  sourceHeight: number;
  /** MP4 descargables por calidad: [{ h: 720, bytes: 123 }, …] */
  downloads: { h: number; bytes: number }[];
}

async function transcode(video: Video): Promise<TranscodeResult> {
  const adapter = getAdapter("R2") as CloudflareR2Adapter;
  const folder = CloudflareR2Adapter.folderOf(video.providerVideoId);
  const work = await mkdtemp(path.join(tmpdir(), "hls-"));

  try {
    // 1) Descargar el original
    const src = path.join(work, "source");
    const obj = await adapter.client.send(
      new GetObjectCommand({ Bucket: adapter.bucket, Key: video.providerVideoId }),
    );
    await pipeline(obj.Body as Readable, createWriteStream(src));

    // 2) Analizar
    const probe = await ffprobe(src);
    const renditions = LADDER.filter((r) => r.height <= probe.height);
    if (renditions.length === 0) renditions.push({ ...LADDER[LADDER.length - 1], height: probe.height });

    // 3) HLS multi-calidad
    const out = path.join(work, "hls");
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", src];
    renditions.forEach((r, i) => {
      args.push("-map", "0:v:0");
      if (probe.hasAudio) args.push("-map", "0:a:0");
      args.push(
        `-filter:v:${i}`, `scale=-2:${r.height}`,
        `-c:v:${i}`, "libx264",
        `-b:v:${i}`, `${r.videoKbps}k`,
        `-maxrate:v:${i}`, `${Math.round(r.videoKbps * 1.07)}k`,
        `-bufsize:v:${i}`, `${r.videoKbps * 2}k`,
      );
      if (probe.hasAudio) args.push(`-c:a:${i}`, "aac", `-b:a:${i}`, `${r.audioKbps}k`, `-ac:a:${i}`, "2");
    });
    args.push(
      "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", path.join(out, "%v", "seg_%04d.ts"),
      "-master_pl_name", "master.m3u8",
      "-var_stream_map", renditions.map((_, i) => (probe.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(" "),
      path.join(out, "%v", "index.m3u8"),
    );
    await run("ffmpeg", args);

    // 4) Miniatura
    const posterPath = path.join(work, "poster.jpg");
    const at = probe.durationSec ? Math.min(2, probe.durationSec / 2) : 0;
    const poster = await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", src,
      "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", posterPath,
    ]).then(() => true, () => false);

    // 5) MP4 descargables por calidad: re-empaquetado SIN recodificar
    //    (copia de streams desde el HLS recién generado → CPU casi nula).
    const downloads: { h: number; bytes: number; file: string }[] = [];
    if (getR2Env().R2_HLS_DOWNLOAD_RENDITIONS) {
      const dlDir = path.join(work, "downloads");
      await mkdir(dlDir, { recursive: true });
      for (const [i, r] of renditions.entries()) {
        const file = path.join(dlDir, `${r.height}p.mp4`);
        const ok = await run("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-y", "-i", path.join(out, String(i), "index.m3u8"),
          "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", file,
        ]).then(() => true, () => false);
        if (ok) downloads.push({ h: r.height, bytes: (await stat(file)).size, file });
      }
    }

    // 6) Subir a R2
    const files = (await readdir(out, { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => path.join(d.parentPath, d.name));
    const uploads = files.map((file) => ({ file, key: `${folder}/hls/${path.relative(out, file).split(path.sep).join("/")}` }));
    if (poster) uploads.push({ file: posterPath, key: `${folder}/poster.jpg` });
    for (const d of downloads) uploads.push({ file: d.file, key: `${folder}/downloads/${d.h}p.mp4` });

    await mapLimit(uploads, 8, async ({ file, key }) => {
      await adapter.client.send(
        new PutObjectCommand({
          Bucket: adapter.bucket,
          Key: key,
          // Streaming desde disco: no carga archivos grandes en memoria.
          Body: createReadStream(file),
          ContentLength: (await stat(file)).size,
          ContentType: CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    });

    return {
      durationSec: probe.durationSec,
      poster,
      sourceHeight: probe.height,
      downloads: downloads.map(({ h, bytes }) => ({ h, bytes })),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function ffprobe(file: string) {
  const json = await run("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_entries",
    "stream=codec_type,height:format=duration", file,
  ]);
  const data = JSON.parse(json) as {
    streams: { codec_type: string; height?: number }[];
    format?: { duration?: string };
  };
  const video = data.streams.find((s) => s.codec_type === "video");
  if (!video?.height) throw new Error("El archivo no contiene una pista de video válida");
  const duration = Number(data.format?.duration);
  return {
    height: video.height,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
    durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
  };
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} salió con código ${code}: ${stderr.trim()}`)),
    );
  });
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}
