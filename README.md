# MirrorView

MirrorView is a local-network mobile UI preview tool. It generates a QR code for the computer's LAN URL and synchronizes a responsive preview with iOS and Android browsers on the same Wi-Fi network.

## Run locally

```bash
npm install
npm run dev
```

Open the desktop URL printed by Vite, scan the QR code, and keep the computer and phone on the same Wi-Fi network. If the QR code does not work, check firewall permissions, VPN settings, and whether the Wi-Fi network isolates clients.

The QR code opens `/?mode=viewer` on the phone. The first version synchronizes UI data; it does not provide pixel-level screen casting or remote desktop streaming.

## Build

```bash
npm run build
```
