# r2-event-forwarder (opcional)

Reenvía las notificaciones de eventos de R2 al endpoint `/api/webhooks/cloudflare`.

```bash
# 1. Cola + notificación de eventos del bucket (solo objetos de video originales)
npx wrangler queues create r2-video-events
npx wrangler r2 bucket notification create <R2_BUCKET> \
  --event-type object-create --event-type object-delete \
  --queue r2-video-events --prefix "videos/"

# 2. Desplegar el Worker
cd workers/r2-event-forwarder
npx wrangler secret put WEBHOOK_SECRET   # mismo valor que R2_WEBHOOK_SECRET
npx wrangler deploy
```

El backend ignora los objetos HLS / miniaturas y solo reacciona a `videos/<token>/source.<ext>`.
