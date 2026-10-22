import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Role = "sender" | "receiver" | "preview";

type SignalMessage =
  | { type: "join"; session: string; role: "sender" | "receiver" }
  | { type: "offer"; session: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; session: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; session: string; candidate: RTCIceCandidateInit }
  | { type: "stop"; session: string; reason?: string }
  | { type: "peer-joined"; session: string; role: "sender" | "receiver" }
  | { type: "peer-disconnected"; session: string; role: "sender" | "receiver"; reason?: string }
  | { type: "error"; message: string };

type NetworkInfo = {
  addresses: string[];
  appUrls: string[];
};

const DEFAULT_PREVIEW = {
  title: "MirrorView",
  message: "Flujo de fallback de vista previa.",
  accent: "#7c5cff",
};

const QUERY = new URLSearchParams(window.location.search);
const queryRole = QUERY.get("role");
const role: Role = queryRole === "sender" || queryRole === "receiver" || queryRole === "preview" ? queryRole : "receiver";

const isGithubPages = window.location.hostname === "pablotwoelf.github.io";
const requestedSignalUrl = QUERY.get("signal")?.trim();
const defaultSignalUrl = isGithubPages ? null : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:5174`;
const signalingUrl = requestedSignalUrl || defaultSignalUrl;

function ensureSessionInQuery(currentRole: Role): string {
  const params = new URLSearchParams(window.location.search);
  let session = params.get("session")?.trim();
  if (!session) {
    session = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    params.set("session", session);
  }
  params.set("role", currentRole);
  const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", next);
  }
  return session;
}

function buildAppUrl(origin: string, nextRole: "sender" | "receiver", session: string): string {
  const url = new URL(import.meta.env.BASE_URL, origin);
  url.searchParams.set("role", nextRole);
  url.searchParams.set("session", session);
  return url.toString();
}

function getIosSafariLimitMessage(): string {
  return "En iOS Safari la captura completa de pantalla puede no estar disponible. Para producción real en iPhone se requiere ReplayKit (app nativa) o un navegador iOS con soporte explícito de screen capture.";
}

export default function App() {
  const session = useMemo(() => ensureSessionInQuery(role), []);

  if (role === "sender") return <SenderView session={session} />;
  if (role === "preview") return <PreviewFallback />;
  return <ReceiverView session={session} />;
}

function ReceiverView({ session }: { session: string }) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Preparando receptor...");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [senderUrl, setSenderUrl] = useState(buildAppUrl(window.location.origin, "sender", session));
  const [reconnectTick, setReconnectTick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!signalingUrl) {
      setStatus("Sin servidor de señalización: GitHub Pages es estático.");
      setError("Configura un servidor de señalización y agrega ?signal=wss://tu-servidor para habilitar WebRTC.");
      return;
    }

    let cancelled = false;
    const networkUrl = new URL("/network-info", signalingUrl.replace(/^ws/, "http"));
    networkUrl.searchParams.set("appPort", window.location.port || "5173");
    networkUrl.searchParams.set("basePath", import.meta.env.BASE_URL);

    void fetch(networkUrl.toString(), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<NetworkInfo>) : Promise.reject(new Error("network-info unavailable"))))
      .then((info) => {
        if (cancelled) return;
        const firstUrl = info.appUrls[0];
        if (firstUrl) {
          setSenderUrl(buildAppUrl(firstUrl, "sender", session));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSenderUrl(buildAppUrl(window.location.origin, "sender", session));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!signalingUrl) return;

    setError(null);
    setStatus("Conectando con señalización...");

    const sendSignal = (message: SignalMessage) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(message));
    };

    const closePeer = (nextStatus: string) => {
      setStatus(nextStatus);
      setRemoteStream(null);
      const peer = pcRef.current;
      pcRef.current = null;
      peer?.close();
    };

    const getPeer = () => {
      if (pcRef.current) return pcRef.current;
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null);
        setStatus("Recibiendo pantalla en vivo.");
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({ type: "ice", session, candidate: event.candidate.toJSON() });
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setStatus("Conexión WebRTC establecida.");
        if (peer.connectionState === "failed") {
          setError("Falló la conexión WebRTC. Usa Reintentar.");
          closePeer("Conexión fallida.");
        }
        if (peer.connectionState === "disconnected") setStatus("El emisor se desconectó.");
      };
      pcRef.current = peer;
      return peer;
    };

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Esperando que el iPhone/Android pulse “Compartir mi pantalla”.");
      sendSignal({ type: "join", session, role: "receiver" });
    };

    ws.onmessage = async (event) => {
      const incoming = JSON.parse(String(event.data)) as SignalMessage;
      if (incoming.type === "peer-joined") {
        setStatus("Emisor conectado. Esperando permiso de captura...");
        return;
      }
      if (incoming.type === "offer") {
        try {
          const peer = getPeer();
          await peer.setRemoteDescription(incoming.sdp);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal({ type: "answer", session, sdp: answer });
          setStatus("Oferta recibida. Negociando transmisión...");
        } catch {
          setError("No se pudo procesar la oferta WebRTC.");
        }
        return;
      }
      if (incoming.type === "ice") {
        try {
          const peer = getPeer();
          await peer.addIceCandidate(incoming.candidate);
        } catch {
          setError("Error aplicando ICE candidate.");
        }
        return;
      }
      if (incoming.type === "stop") {
        closePeer("El emisor detuvo la compartición.");
        return;
      }
      if (incoming.type === "peer-disconnected") {
        closePeer("El emisor salió de la sesión.");
        return;
      }
      if (incoming.type === "error") {
        setError(incoming.message);
      }
    };

    ws.onerror = () => {
      setStatus("Error de señalización.");
      setError("No fue posible conectar al servidor de señalización.");
    };

    ws.onclose = () => {
      setStatus("Señalización desconectada.");
    };

    return () => {
      ws.close();
      wsRef.current = null;
      closePeer("Sesión finalizada.");
    };
  }, [session, reconnectTick]);

  const copySenderUrl = async () => {
    await navigator.clipboard.writeText(senderUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const goFullscreen = async () => {
    if (!videoPanelRef.current) return;
    await videoPanelRef.current.requestFullscreen();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-mark"><span className="brand-dot" />MirrorView</div>
          <p className="eyebrow">RECEIVER / HOST</p>
        </div>
        <div className={`connection-pill ${error ? "offline" : "online"}`}><span className="status-dot" />{error ? "Requiere acción" : "Listo"}</div>
      </header>

      <section className="hero role-hero">
        <div className="hero-copy">
          <p className="eyebrow">FLUJO PRINCIPAL</p>
          <h1>Escanea y comparte pantalla en vivo.</h1>
          <p className="hero-description">
            1) Abre este panel en tu PC/tablet. 2) Escanea el QR desde iPhone/Android. 3) En el teléfono toca <strong>Compartir mi pantalla</strong> y acepta permisos.
          </p>
          <div className="hero-actions">
            <button className="button secondary" onClick={copySenderUrl}>{copied ? "Copiado" : "Copiar URL del emisor"}</button>
            <button className="button secondary" onClick={() => setReconnectTick((value) => value + 1)}>Reintentar conexión</button>
          </div>
          <p className="status-line">Estado: {status}</p>
          {error ? <p className="error-line">{error}</p> : null}
        </div>

        <div className="qr-card">
          <div className="qr-frame"><QRCodeSVG value={senderUrl} size={210} bgColor="#ffffff" fgColor="#08111f" level="M" /></div>
          <p className="qr-label">QR para abrir el emisor</p>
          <code className="url-display">{senderUrl}</code>
        </div>
      </section>

      <section className="workspace single-column">
        <div className="panel preview-panel" ref={videoPanelRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">VIDEO REMOTO</p>
              <h2>Pantalla recibida</h2>
            </div>
            <button className="button secondary" onClick={goFullscreen} disabled={!remoteStream}>Pantalla completa</button>
          </div>
          <div className="remote-video-shell">
            {remoteStream ? (
              <video ref={videoRef} autoPlay playsInline muted={false} controls={false} className="remote-video" />
            ) : (
              <div className="empty-state">
                <p>Esperando transmisión del emisor…</p>
                <small>Si usas GitHub Pages, necesitas un servidor de señalización externo para que WebRTC negocie la conexión.</small>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function SenderView({ session }: { session: string }) {
  const [status, setStatus] = useState("Conecta este teléfono al receptor y pulsa Compartir mi pantalla.");
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [reconnectTick, setReconnectTick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const userAgent = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const iOSWarning = isIOS && isSafari;

  useEffect(() => {
    if (!signalingUrl) {
      setError("No hay señalización disponible en este entorno estático. Usa `npm run dev` o agrega ?signal=wss://tu-servidor.");
      setStatus("Sin señalización.");
      return;
    }

    setError(null);
    setStatus("Conectando señalización...");

    const sendSignal = (message: SignalMessage) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(message));
    };

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Listo para compartir. Esperando al receptor...");
      sendSignal({ type: "join", session, role: "sender" });
    };

    ws.onmessage = async (event) => {
      const incoming = JSON.parse(String(event.data)) as SignalMessage;
      if (incoming.type === "answer") {
        try {
          await pcRef.current?.setRemoteDescription(incoming.sdp);
          setStatus("Receptor conectado. Compartiendo pantalla.");
        } catch {
          setError("No se pudo aplicar la respuesta del receptor.");
        }
        return;
      }
      if (incoming.type === "ice") {
        try {
          await pcRef.current?.addIceCandidate(incoming.candidate);
        } catch {
          setError("Error aplicando ICE candidate remoto.");
        }
        return;
      }
      if (incoming.type === "peer-disconnected") {
        setStatus("El receptor se desconectó.");
        return;
      }
      if (incoming.type === "error") {
        setError(incoming.message);
      }
    };

    ws.onerror = () => {
      setStatus("Error de señalización.");
      setError("No fue posible conectar con el servidor de señalización.");
    };

    ws.onclose = () => {
      setStatus("Señalización desconectada.");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session, reconnectTick]);

  const stopShare = (reason: string) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setSharing(false);
    setStatus(reason);

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop", session, reason } satisfies SignalMessage));
    }
  };

  const startShare = async () => {
    setError(null);

    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
      setError(getIosSafariLimitMessage());
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("No hay conexión de señalización. Usa Reintentar conexión.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });

      peer.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ice", session, candidate: event.candidate.toJSON() } satisfies SignalMessage));
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setStatus("Compartiendo pantalla en vivo.");
        if (peer.connectionState === "failed") {
          setError("La conexión WebRTC falló. Intenta nuevamente.");
          stopShare("Conexión fallida.");
        }
      };

      stream.getTracks().forEach((track) => {
        track.onended = () => stopShare("Compartición detenida por el sistema o usuario.");
        peer.addTrack(track, stream);
      });

      pcRef.current = peer;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: "offer", session, sdp: offer } satisfies SignalMessage));

      setSharing(true);
      setStatus("Solicitud enviada. Acepta permisos del sistema.");
    } catch {
      setError("No se pudo iniciar la captura de pantalla.");
    }
  };

  return (
    <main className="viewer-shell sender-shell">
      <div className="viewer-topbar">
        <div className="brand-mark"><span className="brand-dot" />MirrorView</div>
        <div className={`connection-pill ${error ? "offline" : "online"}`}><span className="status-dot" />{sharing ? "Compartiendo" : "Emisor"}</div>
      </div>

      <div className="viewer-content sender-content">
        <p className="eyebrow">EMISOR (IPHONE/ANDROID)</p>
        <h1>Comparte tu pantalla</h1>
        <p className="viewer-description">Esta sesión enviará video en vivo al receptor con el código de sesión: <strong>{session}</strong>.</p>
        <button className="button primary sender-share-button" onClick={startShare} disabled={sharing || !signalingUrl}>Compartir mi pantalla</button>
        {sharing ? <button className="button secondary" onClick={() => stopShare("Compartición detenida por el usuario.")}>Detener compartición</button> : null}
        <button className="button secondary" onClick={() => setReconnectTick((value) => value + 1)}>Reintentar conexión</button>
        <p className="status-line">Estado: {status}</p>
        {error ? <p className="error-line">{error}</p> : null}

        <div className="notice wide-notice">
          <span className="notice-icon">i</span>
          <div>
            <strong>Permisos y limitaciones</strong>
            <p>Debes iniciar la captura con un toque directo en “Compartir mi pantalla”. WebRTC requiere señalización activa y, para uso remoto, HTTPS.</p>
            {iOSWarning ? <p>{getIosSafariLimitMessage()}</p> : <p>{getIosSafariLimitMessage()}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

function PreviewFallback() {
  return (
    <main className="viewer-shell">
      <div className="viewer-topbar">
        <div className="brand-mark"><span className="brand-dot" />MirrorView</div>
        <div className="connection-pill offline"><span className="status-dot" />Fallback</div>
      </div>
      <div className="viewer-content">
        <p className="eyebrow">LEGACY PREVIEW</p>
        <h1>Vista previa estática</h1>
        <p className="viewer-description">Esta ruta conserva el preview visual anterior como fallback. Usa `role=receiver` y `role=sender` para screen sharing.</p>
        <PhonePreview title={DEFAULT_PREVIEW.title} message={DEFAULT_PREVIEW.message} accent={DEFAULT_PREVIEW.accent} />
      </div>
    </main>
  );
}

function PhonePreview({ title, message, accent }: { title: string; message: string; accent: string }) {
  return (
    <div className="phone-frame">
      <div className="phone-speaker" />
      <div className="phone-screen">
        <div className="phone-statusbar"><span>9:41</span><span>● ● ▰</span></div>
        <div className="preview-gradient" style={{ background: `linear-gradient(135deg, ${accent}, #111a35)` }}>
          <div className="preview-icon">✦</div>
          <span className="preview-kicker">MIRRORVIEW PREVIEW</span>
          <h3>{title}</h3>
          <p>{message}</p>
          <button className="preview-button" style={{ backgroundColor: accent }}>Continue</button>
        </div>
        <div className="preview-bottom-nav"><span className="active">Home</span><span>Activity</span><span>Profile</span></div>
      </div>
    </div>
  );
}
