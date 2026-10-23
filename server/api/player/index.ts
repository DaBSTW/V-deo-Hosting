import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { prisma } from "#srv/prisma";
import { PLAYER_COLORS, WATERMARK_POSITIONS, resolvePlayer } from "#shared/lib/player-settings";

const https = z.string().max(500).refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "httpsRequired");
const schema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  watermark: z.object({
    type: z.enum(["none", "text", "image"]),
    text: z.string().trim().max(40),
    imageUrl: https,
    link: https,
    position: z.enum(WATERMARK_POSITIONS),
    opacity: z.number().int().min(20).max(100),
  }),
  autoplay: z.boolean(),
  loop: z.boolean(),
  showTitle: z.boolean(),
  resume: z.boolean(),
  speed: z.boolean(),
  pip: z.boolean(),
});

/** GET /api/player — personalización del reproductor del usuario (+ colores sugeridos). */
const GET = handler(async () => {
  const user = await requireApiUser();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { playerSettings: true } });
  return json({ settings: resolvePlayer(row.playerSettings), colors: PLAYER_COLORS });
});

/** PUT /api/player — guarda la personalización (se aplica a todos sus videos). */
const PUT = handler(async (req) => {
  const user = await requireApiUser();
  const settings = resolvePlayer(schema.parse(await readJson(req)));
  await prisma.user.update({ where: { id: user.id }, data: { playerSettings: settings as unknown as Prisma.InputJsonObject } });
  return json({ settings, colors: PLAYER_COLORS });
});

export default methods({ GET, PUT });
