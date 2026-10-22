import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

/**
 * Nuxt (Vue 3) sirve la interfaz y la API (Nitro) en un solo proceso.
 *  - app/      interfaz (páginas, componentes, composables)
 *  - server/   API, pasarela /media y middleware; la lógica vive en server/lib
 *  - shared/   código común (i18n, formatos, textos legales)
 */
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  telemetry: false,
  css: ["~/assets/styles/main.css"],
  vite: { plugins: [tailwindcss()] },
  alias: {
    "#srv": fileURLToPath(new URL("./server/lib", import.meta.url)),
  },
  runtimeConfig: {
    public: {
      /** Nombre comercial visible (NUXT_PUBLIC_APP_NAME). */
      appName: process.env.NUXT_PUBLIC_APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || "Dembed",
    },
  },
  app: {
    head: {
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      link: [{ rel: "icon", type: "image/svg+xml", href: "/icon.svg" }],
    },
  },
  nitro: {
    typescript: { tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } } },
    // `useEvent()` en los servicios (sesión de la petición en curso).
    experimental: { asyncContext: true },
  },
  typescript: {
    typeCheck: false,
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
    sharedTsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
    nodeTsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
  },
});
