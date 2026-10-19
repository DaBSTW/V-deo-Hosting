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
| `POST`   | `/api/videos/upload-url`     | `{ title, fileName, sizeBytes, mimeType }` → `{ videoId, upload }` |
| `POST`   | `/api/videos/confirm`        | `{ videoId, durationSec? }` → verifica con el proveedor y activa el video |
| `GET`    | `/api/videos/:publicId`      | Detalle de un video |
| `DELETE` | `/api/videos/:publicId`      | Borra los archivos remotos (vía adaptador) y el registro local |
| `POST`   | `/api/webhooks/cloudflare`   | Receptor genérico (Stream: `Webhook-Signature`; R2: `X-R2-Event-Signature`) |
| `GET`    | `/media/:publicId/:asset`    | `source` \| `poster`: pasarela firmada → `302` |

`upload` es una instrucción genérica, igual sea cual sea el proveedor:

```jsonc
{ "protocol": "single", "method": "PUT", "url": "…", "headers": { "Content-Type": "video/mp4" } }
// o
{ "protocol": "resumable", "url": "…", "chunkSizeBytes": 52428800 }
```

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

* R2 con una sola URL `PUT` admite hasta 5 GB por archivo. Para más, habría que implementar subida
  multiparte prefirmada en el adaptador. La interfaz ya lo permite con otro valor de `protocol`.
* Cambiar `VIDEO_PROVIDER` requiere reiniciar el proceso de Node (las variables de entorno se leen al arrancar).
* El worker HLS gasta CPU del VPS. En máquinas pequeñas, limita su concurrencia (procesa un video cada vez) o usa Stream.
