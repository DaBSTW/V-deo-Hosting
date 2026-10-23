/**
 * Popunder y frecuencia de anuncios por espectador (localStorage; si no está
 * disponible, el anuncio se muestra siempre). Se usa en el reproductor (al
 * pulsar reproducir) y en el botón de descarga.
 */
export function adDue(key: string, everyMin: number): boolean {
  if (!everyMin) return true;
  try {
    return Date.now() - Number(localStorage.getItem(key) ?? 0) >= everyMin * 60_000;
  } catch {
    return true;
  }
}

export function markAdShown(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Abre el popunder en otra pestaña y devuelve el foco a la página. Debe
 * llamarse de forma síncrona dentro del clic: el navegador bloquea las
 * ventanas que no nacen de un gesto del usuario.
 */
export function openPopunder(url: string | null | undefined, key: string, everyMin: number): boolean {
  if (!url || !adDue(key, everyMin)) return false;
  markAdShown(key);
  const w = window.open("about:blank", "_blank");
  if (!w) return false;
  // Sin `opener`: la página del anunciante no puede tocar la nuestra.
  w.opener = null;
  w.location.href = url;
  window.focus();
  return true;
}
