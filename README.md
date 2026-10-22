# MirrorView

## ES — Prototipo de screen sharing por QR + WebRTC

MirrorView ahora prioriza el flujo **receptor/emisor**:

- **Receptor (host, PC/tablet):** `?role=receiver&session=...`
- **Emisor (iPhone/Android):** `?role=sender&session=...`

El receptor genera un QR con la URL del emisor para esa sesión. El emisor muestra un botón grande **"Compartir mi pantalla"** y solicita permiso del sistema usando `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })`.

### Instalación

```bash
npm install
```

### Desarrollo local (app + señalización)

```bash
npm run dev
```

Este comando inicia:

- Vite en `http://<host>:5173/MirrorView/`
- Servidor de señalización WebRTC en `ws://<host>:5174`

### Flujo exacto

1. Abre en tu computadora/tablet: `http://localhost:5173/MirrorView/?role=receiver`
2. Se generará un `session` y un QR.
3. Escanea ese QR desde el iPhone/Android.
4. En el teléfono abre la vista emisor y toca **"Compartir mi pantalla"**.
5. Acepta los permisos del sistema.
6. El receptor mostrará el video remoto en vivo.

### Requisitos y limitaciones honestas

- Ambos dispositivos deben estar en la misma red local para la demo LAN.
- WebRTC necesita señalización (offer/answer/ICE). **GitHub Pages es estático y no incluye señalización**.
- Para conexiones fuera de LAN normalmente necesitas HTTPS + TURN/STUN adecuados.
- iOS Safari puede no soportar captura completa de pantalla en todos los casos web. Para compartir pantalla real de iPhone de forma robusta en producción se requiere una app nativa con **ReplayKit Broadcast Extension** (u otra capacidad iOS equivalente).

### GitHub Pages

- Base path correcto del repo: `/MirrorView/`
- URL pública receptor: `https://pablotwoelf.github.io/MirrorView/?role=receiver`

En Pages verás la UI y el QR, pero sin servidor de señalización externo no habrá conexión WebRTC. Puedes inyectar uno con:

- `?signal=wss://tu-servidor` (en receptor/emisor)

### Build

```bash
npm run build
```

### Ruta de fallback

Se conserva una ruta visual legacy:

- `?role=preview`

---

## EN — QR + WebRTC screen-sharing prototype

MirrorView now prioritizes a **receiver/sender** flow:

- **Receiver (host, desktop/tablet):** `?role=receiver&session=...`
- **Sender (iPhone/Android):** `?role=sender&session=...`

The receiver generates a QR for the sender URL in that session. The sender shows a large **"Compartir mi pantalla"** button and requests permission through `getDisplayMedia({ video: true, audio: false })`.

### Install

```bash
npm install
```

### Local run (app + signaling)

```bash
npm run dev
```

This starts:

- Vite app on `http://<host>:5173/MirrorView/`
- WebRTC signaling on `ws://<host>:5174`

### Exact flow

1. Open receiver on desktop/tablet: `http://localhost:5173/MirrorView/?role=receiver`
2. A session + QR are created.
3. Scan the QR with iPhone/Android.
4. On the phone, tap **"Compartir mi pantalla"**.
5. Accept OS permissions.
6. Receiver displays live remote video.

### Requirements and honest limitations

- Keep both devices on the same network for the LAN demo.
- WebRTC requires signaling (offer/answer/ICE). **GitHub Pages is static and does not host signaling**.
- For non-LAN scenarios, proper HTTPS + STUN/TURN are usually required.
- iOS Safari may not support full screen capture in all web contexts. Reliable real iPhone screen sharing generally requires a native app with **ReplayKit Broadcast Extension** (or equivalent iOS capability).

### GitHub Pages

- Repo base path is `/MirrorView/`
- Public receiver URL: `https://pablotwoelf.github.io/MirrorView/?role=receiver`

On Pages, UI works but WebRTC will stay disconnected unless you provide an external signaling server:

- `?signal=wss://your-server`

### Build

```bash
npm run build
```
