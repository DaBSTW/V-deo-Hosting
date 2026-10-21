/**
 * Código de anuncios de Monetag (pegado por el admin) en /v y /embed. La
 * página lo deja en `event.context.adSnippet` durante el render del servidor
 * y aquí se añade al final del <body>: sus <script> se ejecutan al cargar y
 * Vue nunca lo toca al hidratar. Nunca aparece en el dashboard.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const snippet = (event.context.adSnippet as string | undefined)?.trim();
    if (snippet) html.bodyAppend.push(`<div id="ad-slot">${snippet}</div>`);
  });
});
