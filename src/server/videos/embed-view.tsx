/**
 * Render compartido por /embed/:id y /v/:id. Solo recibe datos ya
 * normalizados por el servicio; no sabe qué proveedor hay detrás.
 */
import { notFound } from "next/navigation";
import { cache } from "react";
import { isPublicVideoId } from "@/lib/ids";
import { PlayerMessage } from "@/components/player/PlayerMessage";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { getEmbedPlayback } from "./service";

/** `cache` → metadata y página comparten una sola consulta / firma por request. */
export const loadEmbed = cache(async (publicId: string) => {
  if (!isPublicVideoId(publicId)) notFound();
  const result = await getEmbedPlayback(publicId);
  if (result.state === "not_found") notFound();
  return result;
});

export function EmbedBody({ data, autoPlay }: { data: Awaited<ReturnType<typeof loadEmbed>>; autoPlay?: boolean }) {
  switch (data.state) {
    case "processing":
      return <PlayerMessage title={data.title} message="Este video se está procesando. Vuelve en unos minutos." />;
    case "error":
      return <PlayerMessage title={data.title} message="Este video no está disponible." />;
    case "ready":
      return <VideoPlayer source={data.source} title={data.title} autoPlay={autoPlay} viewUrl={data.viewUrl} />;
  }
}
