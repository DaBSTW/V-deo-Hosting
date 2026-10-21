import type { DownloadChoice, PublicPlayback } from "~/types/video";

/**
 * Datos de reproducción de /v y /embed. El código de anuncios no viaja al
 * navegador en el payload: se queda en el contexto de la petición del
 * servidor (plugin `ad-slot`).
 */
export async function usePublicVideo(publicId: string) {
  const event = useRequestEvent();
  const { data, error } = await useFetch<PublicPlayback>(`/api/public/videos/${publicId}`, {
    key: `video-${publicId}`,
    transform: (d) => {
      if (d.state !== "ready") return d;
      if (import.meta.server && event && d.monetization?.adSnippet) event.context.adSnippet = d.monetization.adSnippet;
      return { ...d, monetization: d.monetization ? { qualifyAfterSec: d.monetization.qualifyAfterSec } : null };
    },
  });
  if (error.value || !data.value || data.value.state === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "Not found", fatal: true });
  }
  return data as Ref<Exclude<PublicPlayback, { state: "not_found" }>>;
}

export type { DownloadChoice };
