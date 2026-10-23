/**
 * Subtítulos por video (WebVTT). Se aceptan archivos .srt o .vtt: los SRT se
 * convierten a WebVTT al subirlos, que es el formato que entiende el navegador.
 * Se sirven desde `/subs/<publicId>/<id>.vtt?v=<versión>` con caché larga.
 */
import { Prisma, type Subtitle } from "@prisma/client";
import { prisma } from "#srv/prisma";
import { HttpError } from "../http";

export const MAX_SUBTITLES_PER_VIDEO = 10;
export const MAX_SUBTITLE_BYTES = 1024 * 1024;
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export interface PublicSubtitle {
  id: string;
  lang: string;
  label: string;
  isDefault: boolean;
  /** Ruta propia; `v` cambia al editar, así la caché nunca sirve una versión vieja. */
  src: string;
  cues: number;
}

const TIME = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

/** Convierte SRT (o limpia VTT) a WebVTT. Lanza `invalidSubtitles` si no hay ningún subtítulo. */
export function toWebVtt(raw: string): string {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text.startsWith("WEBVTT")) {
    text = text
      // 00:00:01,500 --> 00:00:03,000  →  00:00:01.500 --> 00:00:03.000
      .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, "$1.$2")
      // Números de secuencia del SRT (una línea solo con dígitos antes del tiempo).
      .replace(/(^|\n\n)\d+\n(?=[^\n]*-->)/g, "$1");
    text = `WEBVTT\n\n${text}`;
  }
  if (!TIME.test(text)) throw new HttpError(400, "invalidSubtitles");
  return `${text}\n`;
}

const countCues = (vtt: string) => vtt.split("\n").filter((l) => l.includes("-->")).length;

export const subtitleSrc = (publicId: string, s: Pick<Subtitle, "id" | "updatedAt">) =>
  `/subs/${publicId}/${s.id}.vtt?v=${s.updatedAt.getTime().toString(36)}`;

const toPublic = (publicId: string, s: Subtitle): PublicSubtitle => ({
  id: s.id,
  lang: s.lang,
  label: s.label,
  isDefault: s.isDefault,
  src: subtitleSrc(publicId, s),
  cues: countCues(s.content),
});

async function ownedVideo(userId: string, publicId: string) {
  const video = await prisma.video.findUnique({ where: { publicId }, select: { id: true, userId: true } });
  if (!video || video.userId !== userId) throw new HttpError(404, "videoNotFound");
  return video;
}

export async function listSubtitles(userId: string, publicId: string): Promise<PublicSubtitle[]> {
  const video = await ownedVideo(userId, publicId);
  const rows = await prisma.subtitle.findMany({ where: { videoId: video.id }, orderBy: { createdAt: "asc" } });
  return rows.map((s) => toPublic(publicId, s));
}

/** Solo un subtítulo por video puede activarse por defecto. */
async function clearDefault(tx: Prisma.TransactionClient, videoId: string, exceptId?: string) {
  await tx.subtitle.updateMany({ where: { videoId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefault: false } });
}

export async function addSubtitle(userId: string, publicId: string, input: { lang: string; label: string; content: string; isDefault: boolean }) {
  const video = await ownedVideo(userId, publicId);
  const content = toWebVtt(input.content);
  const count = await prisma.subtitle.count({ where: { videoId: video.id } });
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Mismo idioma: se reemplaza el archivo (subir una versión corregida).
      const existing = await tx.subtitle.findUnique({ where: { videoId_lang: { videoId: video.id, lang: input.lang } } });
      if (!existing && count >= MAX_SUBTITLES_PER_VIDEO) throw new HttpError(400, "tooManySubtitles", { max: MAX_SUBTITLES_PER_VIDEO });
      if (input.isDefault) await clearDefault(tx, video.id);
      return existing
        ? tx.subtitle.update({ where: { id: existing.id }, data: { label: input.label, content, isDefault: input.isDefault } })
        : tx.subtitle.create({ data: { videoId: video.id, lang: input.lang, label: input.label, content, isDefault: input.isDefault } });
    });
    return toPublic(publicId, created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new HttpError(409, "invalidData");
    throw err;
  }
}

export async function updateSubtitle(userId: string, publicId: string, id: string, patch: { label?: string; isDefault?: boolean }) {
  const video = await ownedVideo(userId, publicId);
  const sub = await prisma.subtitle.findUnique({ where: { id } });
  if (!sub || sub.videoId !== video.id) throw new HttpError(404, "subtitleNotFound");
  const updated = await prisma.$transaction(async (tx) => {
    if (patch.isDefault) await clearDefault(tx, video.id, id);
    return tx.subtitle.update({ where: { id }, data: patch });
  });
  return toPublic(publicId, updated);
}

export async function deleteSubtitle(userId: string, publicId: string, id: string) {
  const video = await ownedVideo(userId, publicId);
  const { count } = await prisma.subtitle.deleteMany({ where: { id, videoId: video.id } });
  if (!count) throw new HttpError(404, "subtitleNotFound");
}
