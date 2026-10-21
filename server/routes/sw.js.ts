import { defineEventHandler } from "h3";
import { getMonetizationSettings } from "#srv/monetization/settings";

/**
 * GET /sw.js — service worker que pide Monetag para el formato Push
 * (debe estar en la raíz del dominio). El contenido se pega en el panel de
 * administración; si está vacío responde 404.
 */
export default defineEventHandler(async () => {
  const { monetagServiceWorker } = await getMonetizationSettings();
  if (!monetagServiceWorker.trim()) return new Response("Not found", { status: 404 });
  return new Response(monetagServiceWorker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Service-Worker-Allowed": "/",
    },
  });
});
