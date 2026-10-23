# Dembed: plataforma de alojamiento e inserción de video

Plataforma tipo Fembed / Streamtape pensada para un VPS propio con Cloudflare como proveedor de medios.
El proveedor (**Cloudflare R2** o **Cloudflare Stream**) se elige con una variable de entorno y queda
oculto para el usuario: el dashboard, los embeds y la API solo usan identificadores propios (`v_XXXXXXXXXXXX`).

**Stack:** Nuxt 4 (Vue 3 + TypeScript, servidor Nitro) · PostgreSQL + Prisma · Tailwind CSS v4 · Inter · Lucide · Plyr + hls.js · AWS S3 SDK v3 · tus-js-client.

La interfaz usa el mismo lenguaje que el frontend de Modrinth (Vue/Nuxt + TypeScript) y un diseño inspirado en su estilo; ver [Diseño](#diseño).

---

## Arquitectura

```
                ┌───────────── navegador ─────────────┐
                │  Dashboard  (subida, lista, copiar) │
                │  Embed /embed/v_xxx  (Plyr + hls.js)│
                └──┬───────────────┬───────────────▲──┘
     1. ticket de  │   2. subida   │ 3. confirmar  │ 302 → URL firmada
        subida     │   DIRECTA     │               │ (/media/v_xxx/...)
                   ▼               ▼               │
   ┌──────────── VPS (Nuxt/Nitro) ───────────┐     │
   │ API REST ─► VideoService ─► Factory ────┼─────┘
   │                 │            │          │
   │             PostgreSQL   ┌───┴────────┐ │       ┌──────────────────┐
   │      (publicId ↔ ids     │ R2Adapter  │─┼──────►│ Cloudflare R2    │
   │       privados)          │ StreamAd.  │─┼──────►│ Cloudflare Stream│
   │                          └────────────┘ │       └────────┬─────────┘
   │ /api/webhooks/cloudflare ◄──────────────┼── webhooks ────┘
   └─────────────────────────────────────────┘
```

* **El video nunca pasa por el VPS:** el navegador sube directamente al proveedor con una URL
  prefirmada (R2) o una sesión TUS reanudable (Stream), y reproduce directamente desde el CDN.
* **Patrón Strategy / Adapter:** `VideoProviderAdapter` (`server/lib/video-providers/types.ts`) es
  la única puerta al almacenamiento. Nada fuera de `server/lib/video-providers/` sabe qué es R2 o Stream.
* **Proveedor por video:** cada fila de `Video` guarda (en privado) `provider` y `providerVideoId`.
  `VIDEO_PROVIDER` decide dónde van las subidas **nuevas**; los videos existentes siguen funcionando
  con el adaptador con el que se subieron. Puedes cambiar de proveedor sin migrar nada.
* **Opacidad total:**
  * El DTO público (`server/lib/videos/dto.ts`) copia solo campos de una lista blanca.
  * El HTML del embed solo contiene rutas propias firmadas y con caducidad
    (`/media/v_xxx/source?e=…&s=…`). Esa ruta valida la firma y responde con un `302` a la URL real
    recién firmada. Los bytes de video no pasan por el VPS.
  * Los errores del proveedor se registran en el log del servidor y el cliente recibe un mensaje genérico.
  * Los iconos del reproductor se sirven desde tu dominio (no se pide nada a CDNs de terceros).

### Estructura

```
prisma/schema.prisma                     Modelos User / Video (+ migración inicial)
server/lib/video-providers/
  types.ts                               ⭐ Interfaz VideoProviderAdapter + tipos agnósticos
  CloudflareR2Adapter.ts                 R2: URLs prefirmadas (S3 SDK), MP4 progresivo / HLS
  CloudflareStreamAdapter.ts             Stream: TUS, webhooks firmados, tokens de reproducción
  factory.ts                             ⭐ Fábrica: VIDEO_PROVIDER → adaptador
  r2-hls-transcoder.ts                   (opcional) ffmpeg → HLS multi-calidad para R2
server/lib/videos/
  service.ts                             Lógica de negocio (DB + adaptador)
  dto.ts                                 ⭐ Frontera de opacidad (DTO público)
  playback-token.ts                      Enlaces /media firmados con caducidad
server/lib/http.ts                       route()/methods(): errores traducidos, CSRF, Request/Response estándar
server/api/…                             Endpoints REST (mismas rutas y contratos)
server/routes/media/[publicId]/[asset]   Pasarela opaca (302 a la URL firmada)
server/middleware/security.ts            Cabeceras de seguridad y protección de /dashboard
server/plugins/ad-slot.ts                Código de anuncios solo en el HTML de /v y /embed
app/pages/                               Páginas Vue: portada, acceso, panel, /v, /embed, legales
app/components/ui · site · dash · …      Sistema de diseño, cabecera/footer, panel, reproductor
app/composables/                         i18n, sesión, tema, API, estado del panel, subidas
app/lib/upload-client.ts                 Cliente de subida agnóstico (PUT, partes o TUS)
shared/                                  i18n (mensajes ICU), formatos, textos legales
scripts/                                 Worker HLS, limpieza, registro del webhook de Stream
workers/r2-event-forwarder               (opcional) Worker: eventos R2 → webhook
```

---

## API

| Método   | Ruta                         | Descripción |
|----------|------------------------------|-------------|
| `POST`   | `/api/auth/register`         | `{ email, password, name? }` → cookie de sesión (JWT httpOnly) |
| `POST`   | `/api/auth/login`            | `{ email, password }` → cookie de sesión |
| `POST`   | `/api/auth/logout`           | Cierra la sesión |
| `GET`    | `/api/auth/me`               | Usuario de la sesión (o `null`) para la interfaz |
| `GET`    | `/api/dashboard`             | Datos iniciales del panel (videos, carpetas, estadísticas, límite) |
| `GET`    | `/api/public/home`           | Datos públicos de la portada (porcentaje de reparto si la monetización está activa, límites) |
| `GET`    | `/api/public/videos/:publicId` | Reproducción para `/v` y `/embed` (solo rutas `/media` propias) |
| `GET`    | `/api/public/legal/:slug`    | Documento legal en el idioma del visitante (`?locale=` opcional) |
| `GET`    | `/api/videos`                | Lista de videos del usuario (DTO público) |
| `POST`   | `/api/videos/upload-url`     | `{ title, fileName, sizeBytes, mimeType, folderId? }` → `{ videoId, upload, thumbnailUpload? }` |
| `POST`   | `/api/videos/upload-parts`   | `{ videoId, parts[] }` → `{ urls }`: URLs firmadas para las partes de una subida grande (máx. 50 por llamada) |
| `POST`   | `/api/videos/confirm`        | `{ videoId, durationSec?, hasThumbnail? }` → verifica con el proveedor y activa el video |
| `GET`    | `/api/videos/:publicId`      | Detalle de un video |
| `PATCH`  | `/api/videos/:publicId`      | `{ title?, folderId?, allowDownload? }` → renombrar / mover / permitir descarga |
| `POST`   | `/api/videos/move`           | `{ videoIds[], folderId }` → mover varios a la vez |
| `GET`    | `/api/stats`                 | Series diarias de reproducciones/descargas (180 días) y cuota |
| `POST`   | `/media/:publicId/view`      | Aviso de reproducción (firmado; lo envía el reproductor al pulsar play) |
| `GET`/`PATCH` | `/api/monetization`     | Saldo acreditado, mes en curso (vistas y estimación), ganancias por mes y país, historial / activar y método de cobro |
| `POST`   | `/api/monetization/payouts`  | Solicitar el cobro del saldo disponible |
| `GET`/`PUT` | `/api/admin/monetization` | (admin) Ajustes, código de Monetag y resumen |
| `GET`    | `/api/admin/payouts`         | (admin) Cola de pagos |
| `GET`    | `/api/admin/settlements`     | (admin) Mes en curso, meses pendientes de cerrar y cierres hechos |
| `GET`/`POST` | `/api/admin/settlements/:month` | (admin) Vistas por país del mes / vista previa o cierre (`{ rpm, defaultRpm, revenue?, confirm }`) |
| `PATCH`  | `/api/admin/payouts/:id`     | (admin) `approve` / `pay` (con referencia) / `reject` (con motivo) |
| `GET`    | `/sw.js`                     | Service worker de Monetag (formato Push) |
| `GET`/`POST` | `/api/kyc`               | Estado / envío (multipart) de la verificación de identidad |
| `GET`    | `/api/admin/kyc`             | (admin) Verificaciones por estado |
| `PATCH`  | `/api/admin/kyc/:id`         | (admin) `approve` / `reject` (con motivo) |
| `GET`    | `/api/admin/kyc/:id/file/:kind` | (admin) Documento descifrado (`front`, `back`, `selfie`) |
| `GET`    | `/api/folders`               | Carpetas del usuario |
| `POST`   | `/api/folders`               | `{ name }` → crear carpeta |
| `PATCH`  | `/api/folders/:id`           | `{ name }` → renombrar |
| `DELETE` | `/api/folders/:id`           | Borra la carpeta; sus videos pasan a «Sin carpeta» |
| `DELETE` | `/api/videos/:publicId`      | Borra los archivos remotos (vía adaptador) y el registro local |
| `POST`   | `/api/webhooks/cloudflare`   | Receptor genérico (Stream: `Webhook-Signature`; R2: `X-R2-Event-Signature`) |
| `GET`    | `/media/:publicId/:asset`    | `source` \| `poster`: pasarela firmada → `302`. `download?q=&nb=&t=`: canje del ticket de descarga |
| `POST`   | `/api/public/videos/:publicId/download` | `{ option }` → `{ url, waitSec }`: ticket de descarga (gratis: espera; Premium: inmediato) |
| `GET`    | `/api/premium`               | Planes y ventajas (público) + estado Premium del usuario |
| `POST`   | `/api/premium/checkout`      | `{ plan: "MONTHLY" \| "YEARLY" }` → `{ approveUrl }` de PayPal |
| `POST`   | `/api/premium/sync`          | `{ subscriptionId? }` → relee la suscripción en PayPal y renueva el pase Premium |
| `POST`   | `/api/premium/cancel`        | Cancela la renovación (se conserva el periodo pagado) |
| `POST`   | `/api/webhooks/paypal`       | Avisos de PayPal: solo disparan una relectura de la suscripción |
| `GET`/`POST` | `/api/videos/:publicId/subtitles` | Subtítulos del video / subir (`{ lang, label, content, isDefault }`) |
| `PATCH`/`DELETE` | `/api/videos/:publicId/subtitles/:id` | Renombrar o predeterminar / borrar |
| `GET`    | `/subs/:publicId/:id.vtt`    | Archivo WebVTT público (caché larga) |
| `GET`/`PUT` | `/api/player`             | Personalización del reproductor del usuario |
| `GET`    | `/api/admin/users`           | (admin) Buscar cuentas (`?q=`, `?suspended=1`) |
| `PATCH`  | `/api/admin/users/:id`       | (admin) `{ monetizationEnabled }`: suspender / reactivar |
| `GET`/`PUT`/`POST` | `/api/admin/premium` | (admin) Ajustes, resumen y acciones `syncPlans` / `syncAll` |

`upload` es una instrucción genérica, igual sea cual sea el proveedor:

```jsonc
{ "protocol": "single", "method": "PUT", "url": "…", "headers": { "Content-Type": "video/mp4" } }
// o
{ "protocol": "resumable", "url": "…", "chunkSizeBytes": 52428800 }
```

---

## Idiomas (i18n)

La plataforma completa está en **español e inglés** con un traductor ICU propio sobre
[`intl-messageformat`](https://formatjs.github.io/docs/intl-messageformat/) (`shared/i18n/translator.ts`),
el mismo para el servidor y la interfaz:

* **Detección automática:** se usa la cookie `NEXT_LOCALE` si el usuario eligió idioma; si no, la cabecera
  `Accept-Language` del navegador (respetando sus pesos `q=`). Si el navegador no pide español ni inglés,
  se muestra en **inglés**.
* **Selector de idioma** en el footer: cambia el idioma al instante, sin recargar, y guarda la cookie.
* **Las URLs no llevan idioma**: los enlaces `/v/…` y `/embed/…` ya compartidos funcionan igual en ambos.
* **Mensajes** en `shared/i18n/messages/es.ts` (referencia) y `en.ts`. Las claves están **tipadas**: una clave
  inexistente o una traducción que falta no compila.
* **Errores de la API:** el servidor responde con el mensaje en el idioma de la petición (`HttpError` usa claves
  de `errors.*`), además de un `code` estable para integraciones.
* **Formatos** de números, fechas y moneda según el idioma (`useFormat()` en la interfaz, `makeFormatters()` en el servidor).
* **Texto enriquecido** (enlaces o negritas dentro de una frase) con `<IntlText k="…">` y un slot por etiqueta.
* El reproductor (controles de Plyr), la página pública, el embed y la página «Preparando descarga» también se traducen.

Para añadir un idioma: crea `shared/i18n/messages/<código>.ts` tipado como `Messages`, añádelo a `LOCALES` en
`shared/i18n/config.ts` y a `messagesFor()`. Si quieres versiones de las páginas legales en ese idioma, añade también su archivo en `shared/content/legal/`.

## Landing page (`/`)

Portada de presentación en `app/pages/index.vue` (ilustración del hero en `app/components/home/Showcase.vue`, HTML/CSS
sin imágenes). Secciones: hero, funciones, cómo funciona, código de inserción, monetización, preguntas frecuentes y
llamada final. Todo el texto está en el bloque `landing` de los mensajes (es/en).

* El **porcentaje de reparto de ingresos** se lee de los ajustes reales de monetización; el ejemplo de RPM es ilustrativo y está marcado como tal.
* El mínimo de retiro, el tamaño máximo de subida y los segundos de una vista monetizada salen de la configuración
  (`MIN_PAYOUT_USD`, `MAX_UPLOAD_MB`, ajustes de administración); no hay cifras inventadas.
* Si el usuario ya tiene sesión, los botones llevan a su panel.

## Páginas legales

En `/legal/<página>`, enlazadas desde el footer de todas las páginas (portada, acceso, dashboard, enlace directo):

| Página | Ruta |
|---|---|
| Términos de servicio | `/legal/terms` |
| Política de privacidad | `/legal/privacy` |
| Política de cookies | `/legal/cookies` |
| Derechos de autor (DMCA) | `/legal/copyright` |
| Uso aceptable | `/legal/acceptable-use` |
| Términos del programa de monetización | `/legal/monetization` |

* Textos en `shared/content/legal/es.ts` y `en.ts`, adaptados a esta plataforma: alojamiento de video, anuncios de
  Monetag, pagos con mínimo de 25 USD, verificación de identidad cifrada con retención limitada, cookies reales
  (`vh_session`, `NEXT_LOCALE`) y política de infractores reincidentes.
* Los datos del operador se toman de `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_DMCA_EMAIL`, `LEGAL_ADDRESS`,
  `LEGAL_JURISDICTION` y `LEGAL_LAST_UPDATED`.
* Al registrarse es **obligatorio aceptar** los Términos y la Política de privacidad. Se guarda la fecha en
  `User.termsAcceptedAt`.
* **Importante:** son una base de partida, no asesoramiento legal. Haz que un abogado de tu jurisdicción los revise,
  sobre todo la ley aplicable, los plazos de conservación fiscal y la política de contenido adulto (prohibido por defecto).
  Si tienes tráfico de la UE, añade un gestor de consentimiento (CMP) para las cookies publicitarias.

## Diseño

Inspirado en el estilo de [Modrinth](https://github.com/modrinth/code) sin copiar su código ni su marca
(su UI es GPL-3 y su logotipo está protegido): los componentes están escritos desde cero para una plataforma de video.

* **Tipografía Inter** (autoalojada con `@fontsource-variable/inter`, sin CDN) y titulares en peso extra-bold.
* **Paleta**: verde de marca `#1bd96a` (oscuro) / `#00af5c` (claro) y superficies escalonadas
  (`#16181c` → `#27292e` → `#34363c`). Tokens en `app/assets/styles/main.css`, expuestos a Tailwind
  (`bg-raised`, `text-contrast`, `text-secondary`, `bg-brand-highlight`…).
* **Tema oscuro por defecto** y tema claro con el botón sol/luna (cookie `theme`, sin parpadeo al cargar).
* Cabecera con navegación en «píldoras», tarjetas con radio de 1 rem, botones con brillo al pasar el
  cursor y leve escala al pulsar, panel con barra lateral, barra flotante para la selección múltiple.
* Componentes base en `app/components/ui/` (`UiButton`, `UiModal`, `UiMenu`, `UiToggle`, `UiSegmented`,
  `UiBadge`, `UiCopyField`…), iconos de [Lucide](https://lucide.dev).

## Dashboard

* Barra lateral con **Todos los videos**, **Sin carpeta** y las **carpetas** del usuario (crear,
  renombrar, eliminar; los contadores se actualizan al momento). La carpeta abierta queda en la URL (`?folder=`).
* Vista en **cuadrícula con miniaturas** o en **lista**, búsqueda por título y orden (recientes, antiguos, nombre, tamaño).
* **Arrastrar y soltar**: archivos sobre la página para subirlos a la carpeta abierta, y tarjetas sobre
  una carpeta de la barra lateral para moverlas. Selección múltiple con Shift para mover o borrar en bloque.
* Panel flotante de subidas (2 en paralelo) con la miniatura local, el progreso y un botón para cancelar.
* Modal de detalle con el reproductor real (el mismo `iframe` que verán tus visitantes), un selector
  de carpeta y botones para copiar el código de inserción y el enlace directo.

## Resumen (portada del dashboard)

Al entrar al dashboard se muestra el **Resumen**, con un selector de periodo (7 / 30 / 90 días)
que afecta a todo lo de abajo:

* **Reproducciones** y **descargas** del periodo, con la variación frente al periodo anterior
  (flecha y texto, nunca solo color), una minitendencia y las de hoy.
* **Almacenamiento** usado. Con `STORAGE_QUOTA_GB`, un medidor que se pone en ámbar al 80 % y en rojo
  al 95 %, y la subida se bloquea al superarlo.
* **Videos** por estado: listos, procesando y con error.
* Contenido publicado (duración total), reproducciones históricas y videos subidos en el periodo.
* **Gráfica diaria** de reproducciones o descargas, con tooltip al pasar el ratón o con las
  flechas del teclado, y una vista de **tabla**.
* **Más vistos** del periodo, **Requiere atención** (errores y procesamientos) y **Subidos recientemente**.

### Cómo se cuentan las visitas sin cargar el VPS

1. El reproductor envía **un único** `navigator.sendBeacon` **al empezar a reproducir**
   (no al cargar la página) a `/media/<id>/view?e=&s=`.
2. El endpoint solo verifica la firma HMAC (sin consultar la DB), descarta repeticiones de la
   misma IP en 30 min y las reproducciones del propio dueño, e **incrementa un contador en memoria**.
3. Cada 10 s (o cada 2 000 videos distintos) el búfer se vuelca con **dos consultas SQL por lote**:
   un *upsert* en `VideoDailyStat` (por video y día, UTC) y un `UPDATE` de los totales en `Video`.
   Mil reproducciones son una escritura, no mil.

Las descargas se cuentan igual, en la redirección de `/media/<id>/download`. Si el proceso se
reinicia de golpe se pueden perder como mucho los últimos ~10 s de eventos. Al borrar un video
se borran también sus estadísticas.

## Monetización (Monetag)

**Modelo: reparto de ingresos (revenue share), sin tarifas fijas.** Monetag te paga a ti por los
anuncios del reproductor y del enlace directo. Durante el mes la plataforma solo **cuenta vistas
monetizadas por país** (sin importe). Al terminar el mes copias de Monetag el **RPM real de cada país**
y el sistema acredita a cada creador el **`revenueSharePct` %** (30 % por defecto) de ese valor:

```
crédito = vistas del país ÷ 1.000 × RPM real del país × 30 %
ej.: RPM real de México 1,50 $ → 0,45 $ por cada 1.000 vistas monetizadas de México
```

Si el CPM de Monetag baja un mes, baja también lo que se reparte: la plataforma no asume la pérdida.
El país lo da Cloudflare en `CF-IPCountry`; sin Cloudflare delante, todo cuenta como desconocido (`XX`)
y se liquida con el «RPM para los demás países».

### Puesta en marcha

1. Define `ADMIN_EMAILS` y entra con esa cuenta. Aparece **Administración** en la barra lateral.
2. En Monetag añade tu dominio, copia la etiqueta `<meta>` de verificación (se inserta en la portada)
   y, si usas Push, el contenido de `sw.js` (se sirve en `/sw.js`).
3. Crea las zonas y pega su código en «Código de anuncios para el reproductor». Solo se inserta en
   `/embed/*` y `/v/*` de videos monetizados, nunca en el dashboard.
4. Ajusta el porcentaje de reparto y las reglas antifraude.
5. Cada mes, en **Administración → Cierre mensual**, cierra el mes anterior (ver abajo).

La monetización está **siempre activa** en todas las cuentas: los usuarios **no pueden desactivarla**
(su panel solo muestra el estado). El campo `User.monetizationEnabled` se conserva para que el operador
pueda suspender una cuenta por fraude directamente en la base de datos. El interruptor general de la
plataforma (Administración) sigue existiendo.
Mientras no pegues el código de anuncios, ninguna vista genera ganancias, para no pagar vistas sin ingresos.

### Anuncios del reproductor: pre-roll VAST y popunder

En **Administración → Monetag → Anuncios del reproductor**:

* **Etiqueta VAST** (zona de video de Monetag u otra red): antes del contenido se reproduce el anuncio,
  con etiqueta «Anuncio», cuenta atrás, «Más información» (clic del anunciante) y **Saltar anuncio**
  cuando lo permita la etiqueta (`skipoffset`) o, si no lo indica, tras los segundos configurados.
  Se envían las impresiones y los eventos (inicio, cuartiles, completado, saltado, silencio).
  Admite Wrappers (hasta 5) y archivos MP4/WebM progresivos; sin VPAID.
* **Popunder** (p. ej. Direct Link de Monetag): se abre en otra pestaña con el primer clic en el
  reproductor y, si está activado «También al pulsar Descargar», al pulsar el botón de descarga
  (o al elegir la calidad), con su propia frecuencia. Sin `opener`, para que la página del
  anunciante no pueda tocar la nuestra.
* **Frecuencia por espectador** para cada uno (en el navegador del espectador).

Nunca se muestran a los suscriptores Premium ni en cuentas suspendidas. La etiqueta, el video del
anuncio y los píxeles los pide **el navegador del espectador** (si pasaran por el VPS, la red vería
nuestra IP y lo marcaría como tráfico no válido); el VPS no hace nada extra. Si el anuncio no llega en
6 s o falla, el video empieza sin él.

### Qué cuenta como vista monetizada

* Solo cuenta si hay código de anuncios configurado (paso 3).
* El reproductor envía un segundo aviso tras **N segundos reales de reproducción** (sin contar saltos),
  o el 50 % del video si es más corto, indicando si hay **bloqueador de anuncios** (con bloqueador no se paga).
* El servidor descarta bots (por User-Agent), al propio dueño, repeticiones de la **misma IP y video en
  24 h** y lo que supere el **tope diario por IP**. Todo en memoria, sin consultar la DB.
* Se acumula por lotes en `MonetizedViewDaily` (usuario · día · país), **sin importe**.
* El dinero se calcula y acredita al **cerrar el mes**; hasta entonces el creador ve sus vistas y una
  **estimación** (con el RPM del último cierre), claramente marcada como tal.

### Cierre mensual

1. En tu panel de Monetag, al final del mes, mira el **RPM por país** (y, si quieres, los ingresos totales).
2. En **Administración → Cierre mensual** elige el mes (solo meses terminados) y escribe el RPM de cada
   país, o pégalo con **«Pegar desde Monetag»** (una línea por país: `MX 1.50`, `México (MX)<tab>1,50`…).
   Los países sin valor usan el **RPM para los demás países**.
3. **Ingresos de Monetag del mes (opcional, recomendado):** activa un tope. El RPM de Monetag se mide sobre
   sus impresiones, que nunca coinciden exactamente con nuestras vistas monetizadas. Con el tope, lo
   repartido nunca supera el 30 % de lo que realmente cobraste; si lo superara, todos los créditos del mes
   se reducen en la misma proporción (se avisa en la vista previa).
4. **Calcular** muestra la vista previa (ingreso estimado, parte de los creadores y de la plataforma, por
   país) y **Cerrar y acreditar** guarda el cierre (`RevenueSettlement`) y los créditos (`EarningCredit`).
   El saldo de los creadores se actualiza al instante. Un mes solo se puede cerrar una vez.

Al migrar desde el modelo anterior (tarifa fija), las ganancias ya acumuladas se convierten en créditos
(«Modelo anterior») y ningún saldo cambia.

### Pagos

El usuario elige un método (PayPal, USDT TRC20, Payoneer o transferencia, cada uno con su mínimo) y
solicita el cobro de todo su saldo disponible. En Administración apruebas, envías el pago por tu cuenta
y lo marcas como **pagado** con la referencia. Si lo **rechazas** (con un motivo visible para el
usuario), el importe vuelve a su saldo automáticamente.

### Verificación de identidad (antes del primer cobro)

Nadie puede cobrar sin la identidad verificada (lo comprueban la solicitud de pago y también la aprobación del administrador).
Al pulsar «Solicitar pago» por primera vez se abre el formulario:

* Nombre legal, fecha de nacimiento (**mayor de 18**), país, tipo y número de documento.
* Fotos del **frente**, **dorso** (no se pide con pasaporte) y una **selfie con el documento**.
* El navegador recomprime las fotos a JPEG de 2.000 px como máximo, lo que **elimina los metadatos EXIF (GPS incluido)**.
  El servidor comprueba la firma real del archivo (JPG/PNG/WebP, ≤ 6 MB).
* Las imágenes y el número de documento se guardan **cifrados con AES-256-GCM** (`KYC_ENCRYPTION_KEY`) en
  `KYC_STORAGE_DIR` del VPS. **Nunca en el bucket de videos**, que puede estar expuesto por un dominio público.
  Sin la clave son ilegibles: **haz copia de la clave**, porque si se pierde no se pueden recuperar.
* En **Administración → Verificaciones de identidad** ves los datos y las fotos (se descifran solo para
  administradores, con `Cache-Control: no-store`), y apruebas o rechazas con un motivo que ve el usuario.
  El usuario puede reenviarla.
* En la cola de pagos aparece el **nombre verificado** junto al destino: comprueba que coincida con el titular de
  la cuenta de PayPal o del banco.
* `npm run kyc:purge` (con un cron diario) borra las imágenes `KYC_RETENTION_DAYS` días después de la decisión.
  Se conserva el registro (nombre, país, tipo, últimos 4 dígitos y decisión).

El **mínimo de retiro es de 25 USD** en todos los métodos (`MIN_PAYOUT_USD`). El administrador puede subirlo
por método, pero no bajarlo de 25.

### Cómo elegir el porcentaje de reparto

* El 30 % por defecto deja el 70 % para cubrir almacenamiento, Stream (si lo usas, se paga por minuto
  entregado), fraude no detectado y tu margen. Puedes cambiarlo en Administración; el cambio solo se
  aplica a los meses que cierres después (los Términos piden avisar a los usuarios con antelación).
* Indica siempre los ingresos totales al cerrar: es lo que garantiza que nunca repartes más de lo que cobras.
* No anuncies importes fijos («$1,50 por cada 1.000 vistas»): el RPM real cambia cada mes y por país.

## Reproductor personalizable

En **Panel → Reproductor** cada creador ajusta el reproductor de todos sus videos (enlace `/v` e insertado
`/embed`), con vista previa en vivo:

* **Color** de los controles (8 sugeridos o cualquiera).
* **Logo o marca de agua** (texto o imagen HTTPS), con enlace opcional, esquina y opacidad. Se muestra
  dentro del reproductor, también en pantalla completa.
* **Subtítulos** (por video, en el modal): archivos `.srt` o `.vtt` (máx. 1 MB) en hasta 10 idiomas,
  uno predeterminado. Los SRT se convierten a WebVTT al subirlos. Se guardan en la DB (pesan pocos KB) y
  se sirven desde `/subs/<id>/<pista>.vtt?v=…` con caché de un año: tras la primera visita los entrega
  Cloudflare. El espectador los elige con el botón CC del reproductor.
* **Saltar intro**: botón durante la intro (o salto automático). La intro se marca en cada video
  (modal del video, con «usar el tiempo actual» de la vista previa) o con una intro predeterminada
  para los videos sin una propia (útil en series).
* **Inicio automático** (solo insertado y en silencio), **bucle**, **título** en el insertado,
  **continuar donde lo dejó** (posición guardada en el navegador del espectador), y los controles de
  **velocidad** e **imagen en imagen**.

Se guarda en `User.playerSettings` (JSON) y viaja en la misma consulta que ya hace la página del video:
sin coste extra para el VPS. Los cambios afectan también a los iframes ya insertados.

## Cuentas (administración)

La monetización está siempre activa. En **Administración → Cuentas** puedes buscar una cuenta y
**suspender** su monetización (p. ej. por fraude): sus videos se ven sin anuncios y no suman vistas
monetizadas ni Premium; el saldo ya acreditado se conserva. **Reactivar** la devuelve a la normalidad.

## Premium (suscripción sin anuncios)

Suscripción opcional para **espectadores**, cobrada con **PayPal** (mensual 4,99 $ o anual 39,99 $, editables):

* **Sin anuncios**: con Premium, `/v` y `/embed` no insertan el código de Monetag.
* **Descargar sin esperar**: los gratuitos ven una cuenta atrás de 30 s en el propio botón (si hay
  varias calidades, empieza al elegirla). La espera la impone el servidor: el ticket de descarga
  (`/media/<id>/download?nb=…`) no vale antes de tiempo y el nivel (`t=f|p`) va firmado.
* **Velocidad de descarga (opcional, apagada por defecto)**: con el interruptor «Limitar la velocidad
  de descarga gratuita» de Administración → Premium y el Worker `workers/download-gateway` desplegado,
  las descargas gratuitas se limitan (500 KB/s por defecto) y las Premium siguen directas al proveedor.
  Mientras esté apagado, gratuitos y Premium descargan a toda velocidad y la plataforma **no anuncia**
  «velocidad sin límite» como ventaja. El Worker es casi gratis, pero en el plan gratuito de Cloudflare
  (10 ms de CPU por petición) puede cortar archivos de varios GB; con el plan de 5 $/mes no hay problema.
* **Se anuncia en toda la plataforma**: enlace en la cabecera y el pie, sección en la portada,
  página `/premium`, tarjeta en la página del video, aviso durante la cuenta atrás y en el panel.
  En los reproductores insertados en webs ajenas no se muestra publicidad de Premium.

### Sin cargar el VPS

* Saber si alguien es Premium **no consulta la DB**: la cookie `dp` lleva el usuario y una caducidad
  firmados con HMAC (máx. 3 días). El middleware la renueva desde la DB una vez al día por usuario.
* Ningún archivo pasa por el VPS: el limitador de velocidad es un Worker de Cloudflare (esperar entre
  trozos no consume CPU) y las descargas Premium redirigen directo a R2/Stream.
* Las vistas de suscriptores van al mismo búfer en memoria que el resto de estadísticas (una consulta
  SQL extra por volcado, sea cual sea el volumen).

### Puesta en marcha

1. Crea una app REST en [developer.paypal.com](https://developer.paypal.com) y rellena
   `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` y `PAYPAL_ENV` (`sandbox` para probar, `live` para cobrar).
2. En **Administración → Premium**, revisa precios y pulsa **Crear / actualizar planes en PayPal**.
   Un cambio de precio crea un plan nuevo; los suscriptores actuales siguen con el suyo.
3. Añade el webhook `https://<tu dominio>/api/webhooks/paypal` en la app de PayPal (eventos
   `BILLING.SUBSCRIPTION.*` y `PAYMENT.SALE.*`).
4. (Opcional, para limitar la velocidad de los gratuitos) Despliega `workers/download-gateway`, rellena
   `DOWNLOAD_GATEWAY_URL` / `DOWNLOAD_GATEWAY_SECRET` y activa el interruptor en Administración → Premium.

La fuente de verdad siempre es la API de PayPal: el retorno del pago, los webhooks y el cron diario
(`npm run premium:sync`) solo provocan una relectura. Un webhook falso no puede activar nada.
`premiumUntil` = fin del periodo cobrado (o el próximo cobro si sigue activa) + 1 día de margen;
al cancelar se conserva lo pagado y un reembolso lo retira.

### Reparto con los creadores

Los suscriptores no ven anuncios, así que sus vistas no generan RPM. Al cerrar cada mes se reparte el
**50 %** (ajustable) de los ingresos **netos** de Premium imputables a ese mes (el anual, 1/12 por mes)
entre los creadores, en proporción a las vistas completas de suscriptores (mismas reglas: tiempo mínimo,
1 por suscriptor y video cada 24 h, tope diario). Aparece en la vista previa del cierre y como
«incl. X de Premium» en las ganancias del creador.

## Página pública: descargar e insertar

El enlace directo (`/v/<id>`) muestra, bajo el reproductor:

* **Descargar**: si hay una sola calidad es un botón directo; si hay varias, un menú para elegir
  (con el tamaño de cada una). Al pulsar, el navegador pide un ticket firmado
  (`POST /api/public/videos/<id>/download`); los gratuitos esperan la cuenta atrás (ver Premium).
  El ticket responde con un **302 a la descarga del proveedor** (o al Worker limitador) con
  `Content-Disposition: attachment` y el nombre del video. **El archivo no pasa por el VPS.**
* **Insertar**: panel con el código `<iframe>` en versión adaptable o de tamaño fijo, listo para copiar.
* **Copiar enlace**.

El dueño puede desactivar la descarga de cada video desde el modal del dashboard
(«Permitir descarga»). `ALLOW_DOWNLOADS=false` la desactiva en toda la plataforma.

| Proveedor | Calidades descargables |
|---|---|
| **R2** | Siempre el **original** (URL prefirmada de 15 min). Con el worker HLS y `R2_HLS_DOWNLOAD_RENDITIONS=true`, también **1080p/720p/480p/360p** (según el original). Se obtienen re-empaquetando a MP4 (`-c copy`) lo que el worker ya codificó para HLS: no se codifica nada más, solo cuesta el almacenamiento extra. |
| **Stream** | Un único MP4 que genera Cloudflare. Se solicita automáticamente cuando el video queda listo. Si alguien pulsa «Descargar» antes de que esté, ve una página «Preparando tu descarga…» que se recarga sola. |

## Miniaturas (sin cargar el VPS)

El VPS **no descarga ni decodifica videos** para generar miniaturas. Según el proveedor:

| Fuente | Cuándo | Coste en el VPS |
|---|---|---|
| **Navegador del usuario** (R2) | Antes de subir, `app/lib/media-probe.ts` abre el archivo **local** en un `<video>` oculto, salta al ~10 % (máx. 3 s, para evitar negros iniciales), dibuja el fotograma en un `<canvas>` y lo exporta a JPEG de 640 px (unos 30-80 KB). El backend devuelve una segunda URL prefirmada (`thumbnailUpload`) y el navegador sube la miniatura **directamente a R2**, en paralelo con el video. | Cero: solo firma una URL y hace un `HEAD` para validar (≤ 2 MB, `image/jpeg`) |
| **Cloudflare Stream** | Stream genera las miniaturas en su CDN al transcodificar. | Cero |
| **Media Transformations** (R2, opcional) | Respaldo para archivos que el navegador no sabe decodificar (algunos MKV/HEVC): con `R2_MEDIA_TRANSFORMATIONS=true`, Cloudflare extrae un fotograma **en el edge** (`/cdn-cgi/media/mode=frame,…`) y lo cachea. Tiene límites de tamaño y duración del archivo de entrada; consulta la documentación vigente. | Cero |
| **Worker HLS** (R2, opcional) | Si ya ejecutas el worker de HLS, aprovecha la pasada de ffmpeg y regenera `poster.jpg` sin coste adicional. | El del propio worker |

Las miniaturas se sirven con la misma pasarela opaca (`/media/<id>/poster?…`). La firma caduca en
intervalos de una hora, así que la URL se mantiene estable y el navegador las cachea. Si no hay
miniatura, la tarjeta muestra un marcador neutro.

---

## Puesta en marcha (local)

```bash
cp .env.example .env            # rellena DATABASE_URL, JWT_SECRET y el proveedor elegido
npm install
npx prisma migrate deploy       # crea las tablas
npm run dev                     # http://localhost:3000 (recarga en caliente)
```

En producción: `npm run build` y `node --env-file=.env .output/server/index.mjs` (o Docker, abajo).
`npm run typecheck` comprueba los tipos de Vue y del servidor, incluidas las claves de traducción.

---

## Configuración de Cloudflare

### Opción B (predeterminada): R2

1. **Crea el bucket** (p. ej. `videos`) y un **API token de R2** con permiso *Object Read & Write*
   sobre ese bucket. Rellena `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`.
2. **CORS del bucket** (R2 → bucket → Settings → CORS policy). Hace falta para la subida directa
   desde el navegador y para hls.js:
   ```json
   [
     {
       "AllowedOrigins": ["https://videos.example.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type", "range"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Si permites embeds en webs de terceros y usas HLS, añade `"*"` (o esos dominios) a `AllowedOrigins` para `GET`.
3. **(Recomendado) Dominio propio:** R2 → bucket → Settings → *Custom Domains* → `media.example.com`,
   y pon `R2_PUBLIC_BASE_URL=https://media.example.com`. Los videos se sirven desde tu dominio con la
   caché de Cloudflare. Las claves de objeto son aleatorias (24 caracteres) y no se pueden adivinar.
   Para limitar el hotlinking, puedes añadir una regla WAF de *Hotlink Protection* o de token.
   Sin dominio propio se usan URLs `GET` prefirmadas (`PLAYBACK_URL_TTL_SEC`).
4. **(Opcional, desactivado por defecto) HLS multi-calidad:** de serie no se transcodifica nada (cero CPU en
   el VPS) y cada video se sirve tal cual se subió. Para activarlo, `R2_HLS_ENABLED=true` (requiere el punto 3) y ejecuta el worker:
   `npm run worker:hls` (o `docker compose --profile hls up -d`). El video se puede ver **al instante**
   en MP4 progresivo. Cuando el worker termina (1080/720/480/360p según el original, más la miniatura),
   el reproductor pasa a HLS con selector de calidad. Si el worker falla, el video sigue en MP4.
   Para que el MP4 empiece a reproducirse rápido, conviene que los archivos lleven `faststart`.
   Si el worker se arranca sin `R2_HLS_ENABLED=true`, se cierra solo sin procesar nada. Al activarlo más
   adelante solo se procesan los videos subidos desde entonces.
5. **(Opcional) Eventos R2:** despliega `workers/r2-event-forwarder` (ver su README) y define
   `R2_WEBHOOK_SECRET`. Así un video se activa aunque el usuario cierre el navegador justo al terminar la subida.

### Opción A: Stream

1. Crea un **API token** con permiso *Stream:Edit*. Rellena `CF_ACCOUNT_ID` y `CF_STREAM_API_TOKEN`.
2. `CF_STREAM_DELIVERY_HOST`: el host `customer-<code>.cloudflarestream.com` de tu cuenta
   (aparece en las URLs de cualquier video del panel de Stream).
3. **Clave de firma** (recomendada; evita una llamada a la API en cada reproducción):
   ```bash
   curl -X POST -H "Authorization: Bearer $CF_STREAM_API_TOKEN" \
     https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/keys
   # → result.id  → CF_STREAM_SIGNING_KEY_ID
   # → result.jwk → CF_STREAM_SIGNING_KEY_JWK
   ```
4. **Webhook:** con `APP_URL` ya público, ejecuta `npx tsx --tsconfig scripts/tsconfig.json scripts/register-stream-webhook.ts` y copia
   el secreto en `CF_STREAM_WEBHOOK_SECRET`. Si los webhooks no llegan (p. ej. en local), el dashboard
   consulta a la API el estado de los videos que llevan más de 20 s en «Procesando».

### Cambiar de proveedor

```diff
- VIDEO_PROVIDER=R2
+ VIDEO_PROVIDER=STREAM
```

Reinicia el proceso (`docker compose restart web` / `pm2 restart`). No hace falta recompilar ni tocar el frontend.
Las subidas nuevas irán al nuevo proveedor y los videos existentes se seguirán reproduciendo desde
el suyo, así que conserva las credenciales del proveedor anterior mientras tengas videos en él.

---

## Despliegue en el VPS

```bash
cp .env.example .env    # APP_URL=https://videos.example.com, secretos, proveedor…
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d --build                 # web + postgres (aplica migraciones al arrancar)
docker compose --profile hls up -d           # OPCIONAL: worker HLS (solo R2 con R2_HLS_ENABLED=true)
```

**Memoria de PostgreSQL:** `docker-compose.yml` lo arranca con ajustes para una VPS de 2 GB
(`shared_buffers=128MB`, `work_mem=4MB`, `max_connections=30`) y un tope de **512 MB** para el contenedor
(`mem_limit`). Así la web, la base de datos y el sistema caben con margen. Si amplías la VPS, sube
`shared_buffers` (~25 % de la RAM) y `mem_limit`.

Pon delante un reverse proxy con TLS. Ejemplo mínimo de Caddy:

```
videos.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Si el dominio pasa por el proxy de Cloudflare (nube naranja), el rate limiting usa `CF-Connecting-IP`.
No hace falta subir `client_max_body_size` ni límites parecidos, porque las subidas no pasan por el VPS.

Tareas periódicas recomendadas (cron):

```cron
0 4 * * *  cd /srv/dembed && docker compose run --rm hls-worker npx tsx --tsconfig scripts/tsconfig.json scripts/cleanup-stale-uploads.ts
30 4 * * * cd /srv/dembed && docker compose run --rm hls-worker npx tsx --tsconfig scripts/tsconfig.json scripts/sync-premium.ts
```

---

## Archivos grandes (hasta 20 GB)

El límite por archivo es `MAX_UPLOAD_MB` (por defecto 20480 = 20 GB). El archivo **nunca pasa por el VPS**:

* **R2**: los archivos de hasta 4 GB se suben **enteros** en una sola petición (un PUT único admite ~5 GB).
  Solo los de **más** de `R2_MULTIPART_THRESHOLD_MB` (4096 MB = 4 GB) van **por partes** (`protocol: "multipart"`). El navegador sube 4 partes en paralelo (64 MB cada una por
  defecto, `R2_MULTIPART_PART_MB`), con reintentos por parte y sin cargar el archivo en memoria. Las URLs de
  cada parte se piden por lotes a `/api/videos/upload-parts` justo antes de usarlas, así no caducan aunque la
  subida dure horas. Al confirmar, el backend lista las partes en R2, comprueba tamaños y completa el objeto
  (el `UploadId` solo vive en la base de datos). Borrar el video aborta la subida pendiente.
  El CORS del bucket no necesita cambios (basta `PUT`).
* **Stream**: subida reanudable (TUS); el máximo del proveedor es 30 GB.

## Seguridad

* Sesiones JWT HS256 en cookie `httpOnly`, `SameSite=Lax` y `Secure` en producción. Contraseñas con bcrypt (coste 12).
* Protección CSRF: las peticiones que modifican datos deben venir del mismo `Origin`.
* Rate limiting en login, registro y emisión de URLs de subida (en memoria; cámbialo por Redis si escalas a varias instancias).
* El tamaño real del archivo se comprueba después de la subida (`HeadObject` / API de Stream). Si no
  coincide con el declarado o supera `MAX_UPLOAD_MB`, el archivo se borra y el video queda en error.
* Webhooks verificados con HMAC-SHA256 en tiempo constante. En Stream además se rechazan firmas con más de 15 min (anti-replay).
* `/embed/*` se puede incrustar (`frame-ancestors` configurable con `EMBED_ALLOWED_ORIGINS`). El resto
  de la app envía `X-Frame-Options: DENY`.
* Los videos ajenos responden 404, nunca 403, para no revelar que existen.

## Limitaciones conocidas

* Una subida por partes interrumpida (pestaña cerrada) no se reanuda: hay que volver a subir el archivo.
  Las partes huérfanas se limpian con `cleanup-stale-uploads` (y R2 aborta solo las incompletas a los 7 días).
* El worker HLS descarga el original a disco para procesarlo: con archivos de 20 GB, deja al menos el
  doble de espacio libre en su directorio temporal.
* Cambiar `VIDEO_PROVIDER` requiere reiniciar el proceso de Node (las variables de entorno se leen al arrancar).
* El worker HLS gasta CPU del VPS. En máquinas pequeñas, limita su concurrencia (procesa un video cada vez) o usa Stream.
