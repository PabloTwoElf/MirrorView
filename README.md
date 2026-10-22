# MirrorView

## ES — Despliegue público (GitHub Pages + señalización en Render)

MirrorView usa WebRTC para reflejar pantalla entre `receiver` y `sender`.

> GitHub Pages **no puede ejecutar WebSockets ni procesos Node.js**.  
> Por eso, el servidor de señalización (`signaling-server.mjs`) debe desplegarse aparte (por ejemplo en Render).

### 1) Instalar y ejecutar en local

```bash
npm install
npm run dev
```

Esto levanta:

- App Vite en `http://<host>:5173/MirrorView/`
- Señalización en `ws://<host>:5174`

### 2) Desplegar señalización en Render

Este repo incluye `render.yaml` con un servicio web Node:

- `buildCommand: npm install`
- `startCommand: npm run dev:signal`
- `healthCheckPath: /health`

Pasos:

1. En Render, crea un **Blueprint** apuntando a este repositorio.
2. Conecta la rama deseada y crea el servicio.
3. Cuando quede activo, copia la URL pública del servicio.
4. Convierte esa URL HTTPS a WSS para WebRTC:
   - `https://mi-servicio.onrender.com` → `wss://mi-servicio.onrender.com`

### 3) Configurar `VITE_SIGNAL_URL` en GitHub

En GitHub: **Settings → Secrets and variables → Actions → Variables**.

Crea la variable de repositorio:

- Nombre: `VITE_SIGNAL_URL`
- Valor: `wss://<tu-servicio-real>.onrender.com`

El workflow de Pages la consume de forma opcional:

- `vars.VITE_SIGNAL_URL` (preferido)
- o `secrets.VITE_SIGNAL_URL`
- si no existe, el build sigue funcionando (sin señalización pública configurada)

### 4) Redeploy de Pages

1. Haz push de cambios (o ejecuta workflow manualmente).
2. Espera a que termine `Deploy MirrorView`.
3. Abre:
   - Receptor: `https://pablotwoelf.github.io/MirrorView/?role=receiver`

### 5) Probar QR con señalización real

1. Abre el receptor.
2. Escanea el QR desde el teléfono.
3. En `sender`, pulsa **Compartir mi pantalla**.
4. Verifica que el enlace/QR incluya `signal=wss://...` junto con `role` y `session`.

Si `VITE_SIGNAL_URL` no está configurada, la app muestra un mensaje de configuración en español y no simula una URL falsa.

---

## EN — Public deployment (GitHub Pages + Render signaling)

MirrorView uses WebRTC between `receiver` and `sender`.

> GitHub Pages **cannot run WebSockets or Node.js processes**.  
> The signaling server (`signaling-server.mjs`) must be deployed separately (for example on Render).

### 1) Install and run locally

```bash
npm install
npm run dev
```

This starts:

- Vite app on `http://<host>:5173/MirrorView/`
- Signaling on `ws://<host>:5174`

### 2) Deploy signaling on Render

This repository includes `render.yaml` with a Node web service:

- `buildCommand: npm install`
- `startCommand: npm run dev:signal`
- `healthCheckPath: /health`

Steps:

1. In Render, create a **Blueprint** from this repository.
2. Connect the target branch and create the service.
3. Once live, copy the public service URL.
4. Convert HTTPS URL to WSS for WebRTC:
   - `https://my-service.onrender.com` → `wss://my-service.onrender.com`

### 3) Configure `VITE_SIGNAL_URL` in GitHub

In GitHub: **Settings → Secrets and variables → Actions → Variables**.

Create repository variable:

- Name: `VITE_SIGNAL_URL`
- Value: `wss://<your-real-service>.onrender.com`

Pages workflow reads it optionally:

- `vars.VITE_SIGNAL_URL` (preferred)
- or `secrets.VITE_SIGNAL_URL`
- if absent, build still succeeds (but public signaling is not configured)

### 4) Redeploy Pages

1. Push changes (or run workflow manually).
2. Wait for `Deploy MirrorView` to finish.
3. Open:
   - Receiver: `https://pablotwoelf.github.io/MirrorView/?role=receiver`

### 5) Validate receiver QR flow

1. Open receiver.
2. Scan QR from phone.
3. Tap **Compartir mi pantalla** on sender.
4. Confirm URL/QR contains `signal=wss://...` plus `role` and `session`.

If `VITE_SIGNAL_URL` is not set, the app shows a clear Spanish setup message and does not hardcode a fake signaling domain.
