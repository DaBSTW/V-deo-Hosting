/**
 * Fábrica de adaptadores de video.
 *
 *  - `getActiveAdapter()`   → el definido por `VIDEO_PROVIDER` en el .env. Se
 *                             usa SOLO para subidas nuevas.
 *  - `getAdapter(provider)` → el adaptador con el que se subió un video
 *                             concreto (campo `provider` en la DB). Se usa para
 *                             reproducir, consultar estado y borrar.
 *
 *  Así, cambiar `VIDEO_PROVIDER=R2` ↔ `VIDEO_PROVIDER=STREAM` (y reiniciar el
 *  proceso, sin recompilar) redirige todas las subidas nuevas al otro
 *  proveedor sin romper los videos ya publicados ni tocar el frontend.
 */
import { getCoreEnv, isR2Configured, isStreamConfigured } from "#srv/env";
import { CloudflareR2Adapter } from "./CloudflareR2Adapter";
import { CloudflareStreamAdapter } from "./CloudflareStreamAdapter";
import type { ProviderName, VideoProviderAdapter } from "./types";

const registry: Record<ProviderName, () => VideoProviderAdapter> = {
  R2: () => new CloudflareR2Adapter(),
  STREAM: () => new CloudflareStreamAdapter(),
};

const configured: Record<ProviderName, () => boolean> = {
  R2: isR2Configured,
  STREAM: isStreamConfigured,
};

// Instancias perezosas y reutilizadas (sobreviven a la recarga en caliente).
const globalCache = globalThis as unknown as {
  __videoAdapters?: Map<ProviderName, VideoProviderAdapter>;
};
const cache = (globalCache.__videoAdapters ??= new Map());

export function getAdapter(provider: ProviderName): VideoProviderAdapter {
  let adapter = cache.get(provider);
  if (!adapter) {
    adapter = registry[provider]();
    cache.set(provider, adapter);
  }
  return adapter;
}

export function getActiveProvider(): ProviderName {
  return getCoreEnv().VIDEO_PROVIDER;
}

export function getActiveAdapter(): VideoProviderAdapter {
  return getAdapter(getActiveProvider());
}

/** Adaptadores con credenciales presentes (para el receptor de webhooks). */
export function getConfiguredAdapters(): VideoProviderAdapter[] {
  return (Object.keys(registry) as ProviderName[])
    .filter((p) => configured[p]() || p === getActiveProvider())
    .map(getAdapter);
}

export type { VideoProviderAdapter, ProviderName } from "./types";
