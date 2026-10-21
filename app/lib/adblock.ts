/**
 * Detección simple de bloqueadores de anuncios (elemento "cebo").
 * Los bloqueadores ocultan elementos con estas clases típicas; si el cebo
 * queda sin altura, asumimos bloqueo. Sirve para no pagar vistas sin anuncio.
 */
export function detectAdblock(timeoutMs = 150): Promise<boolean> {
  return new Promise((resolve) => {
    const bait = document.createElement("div");
    bait.className = "adsbox ad-banner ad-placement pub_300x250 text-ad textAd sponsor-ad";
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;";
    bait.innerHTML = "&nbsp;";
    document.body.appendChild(bait);
    setTimeout(() => {
      const style = getComputedStyle(bait);
      const blocked = bait.offsetHeight === 0 || style.display === "none" || style.visibility === "hidden";
      bait.remove();
      resolve(blocked);
    }, timeoutMs);
  });
}
