/** Carga el usuario de la sesión en el servidor (llega hidratado al navegador). */
export default defineNuxtPlugin(async () => {
  if (import.meta.server) await useSession().refresh();
});
