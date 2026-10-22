# download-gateway (opcional)

Sirve las descargas de los usuarios **gratuitos** a velocidad limitada
(`freeDownloadKbps`, ajustable en Administración → Premium). Los usuarios
Premium descargan directo del proveedor, sin límite.

El VPS nunca transfiere el archivo: solo cifra la URL firmada del proveedor y
redirige a este Worker, que la reenvía con el límite. Sin este Worker, los
gratuitos solo tienen la espera de 30 s (descargan a velocidad completa).

```bash
cd workers/download-gateway
openssl rand -base64 32                       # → mismo valor en el Worker y en el .env
npx wrangler secret put DOWNLOAD_GATEWAY_SECRET
npx wrangler deploy                           # anota la URL (o asigna un dominio propio)
```

En el `.env` del VPS:

```
DOWNLOAD_GATEWAY_URL=https://dl.midominio.com
DOWNLOAD_GATEWAY_SECRET=<el mismo valor>
```

Coste: el tráfico de R2 hacia un Worker no paga salida; cada descarga es una
petición del Worker (plan gratuito: 100 000/día). Esperar entre trozos no
consume tiempo de CPU.
