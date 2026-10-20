# VidHost: plataforma de alojamiento e inserción de video

Plataforma tipo Fembed / Streamtape pensada para un VPS propio con Cloudflare como proveedor de medios.
El proveedor (**Cloudflare R2** o **Cloudflare Stream**) se elige con una variable de entorno y queda
oculto para el usuario: el dashboard, los embeds y la API solo usan identificadores propios (`v_XXXXXXXXXXXX`).

**Stack:** Next.js 15 (App Router, TypeScript) · PostgreSQL + Prisma · Tailwind CSS v4 · Plyr + hls.js · AWS S3 SDK v3 · tus-js-client.

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
   ┌──────────── VPS (Next.js) ──────────────┐     │
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
* **Patrón Strategy / Adapter:** `VideoProviderAdapter` (`src/server/video-providers/types.ts`) es
  la única puerta al almacenamiento. Nada fuera de `src/server/video-providers/` sabe qué es R2 o Stream.
* **Proveedor por video:** cada fila de `Video` guarda (en privado) `provider` y `providerVideoId`.
  `VIDEO_PROVIDER` decide dónde van las subidas **nuevas**; los videos existentes siguen funcionando
  con el adaptador con el que se subieron. Puedes cambiar de proveedor sin migrar nada.
* **Opacidad total:**
  * El DTO público (`src/server/videos/dto.ts`) copia solo campos de una lista blanca.
  * El HTML del embed solo contiene rutas propias firmadas y con caducidad
    (`/media/v_xxx/source?e=…&s=…`). Esa ruta valida la firma y responde con un `302` a la URL real
    recién firmada. Los bytes de video no pasan por el VPS.
  * Los errores del proveedor se registran en el log del servidor y el cliente recibe un mensaje genérico.
  * Los iconos del reproductor se sirven desde tu dominio (no se pide nada a CDNs de terceros).

### Estructura

```
prisma/schema.prisma                     Modelos User / Video (+ migración inicial)
src/server/video-providers/
  types.ts                               ⭐ Interfaz VideoProviderAdapter + tipos agnósticos
  CloudflareR2Adapter.ts                 R2: URLs prefirmadas (S3 SDK), MP4 progresivo / HLS
  CloudflareStreamAdapter.ts             Stream: TUS, webhooks firmados, tokens de reproducción
  factory.ts                             ⭐ Fábrica: VIDEO_PROVIDER → adaptador
  r2-hls-transcoder.ts                   (opcional) ffmpeg → HLS multi-calidad para R2
src/server/videos/
  service.ts                             Lógica de negocio (DB + adaptador)
  dto.ts                                 ⭐ Frontera de opacidad (DTO público)
  playback-token.ts                      Enlaces /media firmados con caducidad
src/app/api/…                            Endpoints REST
src/app/embed/[publicId]                 Reproductor para iframes
src/app/v/[publicId]                     Enlace directo para compartir
src/app/media/[publicId]/[asset]         Pasarela opaca (302 a la URL firmada)
src/app/dashboard                        Panel de usuario
src/components/…                         UI (Tailwind): subida, tabla, reproductor
src/lib/upload-client.ts                 Cliente de subida agnóstico (PUT o TUS)
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
| `GET`    | `/api/videos`                | Lista de videos del usuario (DTO público) |
| `POST`   | `/api/videos/upload-url`     | `{ title, fileName, sizeBytes, mimeType, folderId? }` → `{ videoId, upload, thumbnailUpload? }` |
| `POST`   | `/api/videos/upload-parts`   | `{ videoId, parts[] }` → `{ urls }`: URLs firmadas para las partes de una subida grande (máx. 50 por llamada) |
| `POST`   | `/api/videos/confirm`        | `{ videoId, durationSec?, hasThumbnail? }` → verifica con el proveedor y activa el video |
| `GET`    | `/api/videos/:publicId`      | Detalle de un video |
| `PATCH`  | `/api/videos/:publicId`      | `{ title?, folderId?, allowDownload? }` → renombrar / mover / permitir descarga |
| `POST`   | `/api/videos/move`           | `{ videoIds[], folderId }` → mover varios a la vez |
| `GET`    | `/api/stats`                 | Series diarias de reproducciones/descargas (180 días) y cuota |
| `POST`   | `/media/:publicId/view`      | Aviso de reproducción (firmado; lo envía el reproductor al pulsar play) |
| `GET`/`PATCH` | `/api/monetization`     | Saldo, ganancias, tarifas e historial / activar y método de cobro |
| `POST`   | `/api/monetization/payouts`  | Solicitar el cobro del saldo disponible |
| `GET`/`PUT` | `/api/admin/monetization` | (admin) Ajustes, código de Monetag y resumen |
| `GET`    | `/api/admin/payouts`         | (admin) Cola de pagos |
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
| `GET`    | `/media/:publicId/:asset`    | `source` \| `poster` \| `download?q=<calidad>`: pasarela firmada → `302` |

`upload` es una instrucción genérica, igual sea cual sea el proveedor:

```jsonc
{ "protocol": "single", "method": "PUT", "url": "…", "headers": { "Content-Type": "video/mp4" } }
// o
{ "protocol": "resumable", "url": "…", "chunkSizeBytes": 52428800 }
```

---

## Idiomas (i18n)

La plataforma completa está en **español e inglés** con [`next-intl`](https://next-intl.dev):

* **Detección automática:** se usa la cookie `NEXT_LOCALE` si el usuario eligió idioma; si no, la cabecera
  `Accept-Language` del navegador (respetando sus pesos `q=`). Si el navegador no pide español ni inglés,
  se muestra en **inglés**.
* **Selector de idioma** en el footer (guarda la cookie y recarga los datos sin cambiar de página).
* **Las URLs no llevan idioma**: los enlaces `/v/…` y `/embed/…` ya compartidos funcionan igual en ambos.
* **Mensajes** en `src/i18n/messages/es.ts` (referencia) y `en.ts`. Las claves están **tipadas**: una clave
  inexistente o una traducción que falta no compila.
* **Errores de la API:** el servidor responde con el mensaje en el idioma de la petición (`HttpError` usa claves
  de `errors.*`), además de un `code` estable para integraciones.
* **Formatos** de números, fechas y moneda según el idioma (`useFormat()` en cliente, `makeFormatters()` en servidor).
* El reproductor (controles de Plyr), la página pública, el embed y la página «Preparando descarga» también se traducen.

Para añadir un idioma: crea `src/i18n/messages/<código>.ts` tipado como `Messages`, añádelo a `LOCALES` en
`src/i18n/config.ts` y a `messagesFor()`. Si quieres versiones de las páginas legales en ese idioma, añade también su archivo en `src/content/legal/`.

## Landing page (`/`)

Portada de presentación en `src/app/page.tsx` (ilustración del hero en `src/components/home/HeroMockup.tsx`, HTML/CSS
sin imágenes). Secciones: hero, funciones, cómo funciona, código de inserción, monetización, preguntas frecuentes y
llamada final. Todo el texto está en el bloque `landing` de los mensajes (es/en).

* Las **tarifas por 1.000 vistas** se leen de los ajustes reales de monetización y solo se muestran si está activada.
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

* Textos en `src/content/legal/es.ts` y `en.ts`, adaptados a esta plataforma: alojamiento de video, anuncios de
  Monetag, pagos con mínimo de 25 USD, verificación de identidad cifrada con retención limitada, cookies reales
  (`vh_session`, `NEXT_LOCALE`) y política de infractores reincidentes.
* Los datos del operador se toman de `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_DMCA_EMAIL`, `LEGAL_ADDRESS`,
  `LEGAL_JURISDICTION` y `LEGAL_LAST_UPDATED`.
* Al registrarse es **obligatorio aceptar** los Términos y la Política de privacidad. Se guarda la fecha en
  `User.termsAcceptedAt`.
* **Importante:** son una base de partida, no asesoramiento legal. Haz que un abogado de tu jurisdicción los revise,
  sobre todo la ley aplicable, los plazos de conservación fiscal y la política de contenido adulto (prohibido por defecto).
  Si tienes tráfico de la UE, añade un gestor de consentimiento (CMP) para las cookies publicitarias.

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

**Modelo:** Monetag te paga a ti por los anuncios que se muestran en el reproductor y en el enlace
directo. Tú pagas a tus usuarios una **tarifa fija por cada 1.000 vistas monetizadas**, según el país
del espectador (Nivel 1/2/3). El país lo da Cloudflare en `CF-IPCountry`; sin Cloudflare delante, todo
cuenta como Nivel 3.

### Puesta en marcha

1. Define `ADMIN_EMAILS` y entra con esa cuenta. Aparece **Administración** en la barra lateral.
2. En Monetag añade tu dominio, copia la etiqueta `<meta>` de verificación (se inserta en la portada)
   y, si usas Push, el contenido de `sw.js` (se sirve en `/sw.js`).
3. Crea las zonas y pega su código en «Código de anuncios para el reproductor». Solo se inserta en
   `/embed/*` y `/v/*` de videos monetizados, nunca en el dashboard.
4. Ajusta tarifas y reglas, y activa la monetización.

### Qué cuenta como vista monetizada

* El reproductor envía un segundo aviso tras **N segundos reales de reproducción** (sin contar saltos),
  o el 50 % del video si es más corto, indicando si hay **bloqueador de anuncios** (con bloqueador no se paga).
* El servidor descarta bots (por User-Agent), al propio dueño, repeticiones de la **misma IP y video en
  24 h** y lo que supere el **tope diario por IP**. Todo en memoria, sin consultar la DB.
* Se acumula por lotes (`EarningDaily`, en micro-dólares) con la tarifa vigente en ese momento.
* Las ganancias quedan **retenidas `holdDays` días** antes de poder cobrarse (margen antifraude).

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

### Cómo fijar las tarifas sin perder dinero

* **Mide antes de prometer.** Activa los anuncios 2-4 semanas con tarifas conservadoras y calcula tu
  **eCPM real por nivel** = ingresos de Monetag ÷ vistas monetizadas × 1.000.
* **Paga entre el 50 y el 70 % de ese eCPM.** El resto cubre almacenamiento, Stream (si lo usas se
  paga por minuto entregado), fraude no detectado y tu margen.
* **Revisa las tarifas cada mes.** El eCPM de las redes de popunder varía mucho por país y temporada.
  Un cambio de tarifa solo afecta a las vistas futuras.
* Las tarifas por defecto (1,00 / 0,40 / 0,10 USD) son solo un punto de partida, no una recomendación de mercado.

## Página pública: descargar e insertar

El enlace directo (`/v/<id>`) muestra, bajo el reproductor:

* **Descargar**: si hay una sola calidad es un botón directo; si hay varias, un menú para elegir
  (con el tamaño de cada una). El enlace apunta a `/media/<id>/download?q=<calidad>` (firmado; la
  calidad no se puede manipular), que responde con un **302 a la descarga directa del proveedor**
  con `Content-Disposition: attachment` y el nombre del video. **El archivo no pasa por el VPS.**
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
| **Navegador del usuario** (R2) | Antes de subir, `src/lib/media-probe.ts` abre el archivo **local** en un `<video>` oculto, salta al ~10 % (máx. 3 s, para evitar negros iniciales), dibuja el fotograma en un `<canvas>` y lo exporta a JPEG de 640 px (unos 30-80 KB). El backend devuelve una segunda URL prefirmada (`thumbnailUpload`) y el navegador sube la miniatura **directamente a R2**, en paralelo con el video. | Cero: solo firma una URL y hace un `HEAD` para validar (≤ 2 MB, `image/jpeg`) |
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
npm run dev                     # http://localhost:3000
```

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
4. **(Opcional) HLS multi-calidad:** `R2_HLS_ENABLED=true` (requiere el punto 3) y ejecuta el worker:
   `npm run worker:hls` (o `docker compose --profile hls up -d`). El video se puede ver **al instante**
   en MP4 progresivo. Cuando el worker termina (1080/720/480/360p según el original, más la miniatura),
   el reproductor pasa a HLS con selector de calidad. Si el worker falla, el video sigue en MP4.
   Para que el MP4 empiece a reproducirse rápido, conviene que los archivos lleven `faststart`.
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
4. **Webhook:** con `APP_URL` ya público, ejecuta `npx tsx scripts/register-stream-webhook.ts` y copia
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
docker compose --profile hls up -d           # + worker HLS (solo R2 con R2_HLS_ENABLED)
```

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
0 4 * * *  cd /srv/vidhost && docker compose run --rm hls-worker npx tsx scripts/cleanup-stale-uploads.ts
```

---

## Archivos grandes (hasta 20 GB)

El límite por archivo es `MAX_UPLOAD_MB` (por defecto 20480 = 20 GB). El archivo **nunca pasa por el VPS**:

* **R2**: un PUT único admite ~5 GB, así que a partir de `R2_MULTIPART_THRESHOLD_MB` (1 GB) la subida va
  **por partes** (`protocol: "multipart"`). El navegador sube 4 partes en paralelo (64 MB cada una por
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
