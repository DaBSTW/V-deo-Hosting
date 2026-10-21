/**
 * Nombre comercial (servidor y scripts). En la interfaz se usa
 * `useRuntimeConfig().public.appName`, que lee la misma variable.
 */
export const APP_NAME = process.env.NUXT_PUBLIC_APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || "VidHost";
