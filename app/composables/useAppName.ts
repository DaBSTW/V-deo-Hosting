/** Nombre comercial visible (NUXT_PUBLIC_APP_NAME). */
export const useAppName = () => useRuntimeConfig().public.appName as string;
