import { getMonetizationSettings } from "@/server/monetization/settings";

export const dynamic = "force-dynamic";

/**
 * GET /sw.js — service worker que pide Monetag para el formato Push
 * (debe estar en la raíz del dominio). El contenido se pega en el panel de
 * administración; si está vacío responde 404.
 */
export async function GET() {
  const { monetagServiceWorker } = await getMonetizationSettings();
  if (!monetagServiceWorker.trim()) return new Response("Not found", { status: 404 });
  return new Response(monetagServiceWorker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Service-Worker-Allowed": "/",
    },
  });
}
