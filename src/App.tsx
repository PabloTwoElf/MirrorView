import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type MirrorState = {
  title: string;
  message: string;
  accent: string;
  updatedAt: number;
};

type NetworkInfo = {
  addresses: string[];
  port: number;
  urls: string[];
};

const initialState: MirrorState = {
  title: "Hello from MirrorView",
  message: "Edit this content on your computer and see it update here.",
  accent: "#7c5cff",
  updatedAt: Date.now(),
};

const basePath = import.meta.env.BASE_URL || "/";

function publicViewerUrl() {
  return new URL("?mode=viewer", new URL(basePath, window.location.origin)).toString();
}

function isViewerMode() {
  return new URLSearchParams(window.location.search).get("mode") === "viewer";
}

export default function App() {
  return isViewerMode() ? <Viewer /> : <Host />;
}

function Host() {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [mirrorState, setMirrorState] = useState<MirrorState>(initialState);
  const [title, setTitle] = useState(initialState.title);
  const [message, setMessage] = useState(initialState.message);
  const [accent, setAccent] = useState(initialState.accent);
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(false);

  const viewerUrl = useMemo(() => {
    if (network?.urls[0]) return `${network.urls[0]}/?mode=viewer`;
    return publicViewerUrl();
  }, [network]);

  const refreshNetwork = useCallback(async () => {
    try {
      const response = await fetch("/api/network-info", { cache: "no-store" });
      if (!response.ok) throw new Error("Network information unavailable");
      setNetwork((await response.json()) as NetworkInfo);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void refreshNetwork();
    const interval = window.setInterval(refreshNetwork, 5000);
    return () => window.clearInterval(interval);
  }, [refreshNetwork]);

  useEffect(() => {
    void fetch("/api/state", { cache: "no-store" })
      .then((response) => response.json() as Promise<MirrorState>)
      .then((data) => {
        setMirrorState(data);
        setTitle(data.title);
        setMessage(data.message);
        setAccent(data.accent);
      })
      .catch(() => undefined);
  }, []);

  const publish = useCallback(
    async (next: Partial<MirrorState>) => {
      const nextState = {
        ...mirrorState,
        title: next.title ?? title,
        message: next.message ?? message,
        accent: next.accent ?? accent,
        updatedAt: Date.now(),
      };
      setMirrorState(nextState);
      try {
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextState),
        });
      } catch {
        setOnline(false);
      }
    },
    [accent, message, mirrorState, title],
  );

  const copyUrl = async () => {
    await navigator.clipboard.writeText(viewerUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-mark"><span className="brand-dot" />MirrorView</div>
          <p className="eyebrow">LOCAL DEVICE PREVIEW</p>
        </div>
        <div className={`connection-pill ${online ? "online" : "offline"}`}>
          <span className="status-dot" />{online ? "Local server online" : "Public preview"}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DESKTOP CONTROL CENTER</p>
          <h1>Preview your mobile experience instantly.</h1>
          <p className="hero-description">Scan the QR code with an iPhone or Android device. The public QR uses the complete GitHub Pages path.</p>
          <div className="hero-actions">
            <a className="button primary" href={viewerUrl} target="_blank" rel="noreferrer">Open preview</a>
            <button className="button secondary" onClick={copyUrl}>{copied ? "Copied!" : "Copy phone URL"}</button>
          </div>
        </div>
        <div className="qr-card">
          <div className="qr-frame"><QRCodeSVG value={viewerUrl} size={210} bgColor="#ffffff" fgColor="#08111f" level="M" /></div>
          <p className="qr-label">Scan to open on your phone</p>
          <code className="url-display">{viewerUrl}</code>
        </div>
      </section>

      <section className="workspace">
        <div className="panel controls-panel">
          <div className="panel-heading"><div><p className="eyebrow">SHARED CONTENT</p><h2>Control the preview</h2></div><span className="live-badge">LIVE SYNC</span></div>
          <label className="field"><span>Preview title</span><input value={title} maxLength={120} onChange={(event) => { const value = event.target.value; setTitle(value); void publish({ title: value }); }} /></label>
          <label className="field"><span>Message</span><textarea value={message} maxLength={500} rows={5} onChange={(event) => { const value = event.target.value; setMessage(value); void publish({ message: value }); }} /></label>
          <label className="field color-field"><span>Accent color</span><div className="color-control"><input type="color" value={accent} onChange={(event) => { const value = event.target.value; setAccent(value); void publish({ accent: value }); }} /><code>{accent}</code></div></label>
          <div className="notice"><span className="notice-icon">i</span>GitHub Pages shows a static preview. Local synchronization works with npm run dev.</div>
        </div>
        <div className="panel preview-panel">
          <div className="panel-heading"><div><p className="eyebrow">PHONE PREVIEW</p><h2>What your phone sees</h2></div><span className="device-label">iOS / Android</span></div>
          <div className="phone-stage"><PhonePreview state={mirrorState} /></div>
        </div>
      </section>
    </main>
  );
}

function Viewer() {
  const [state, setState] = useState(initialState);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data = (await response.json()) as MirrorState;
        if (active) { setState(data); setConnected(true); }
      } catch {
        if (active) setConnected(false);
      }
    };
    void poll();
    const interval = window.setInterval(poll, 800);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <main className="viewer-shell">
      <div className="viewer-topbar"><div className="brand-mark"><span className="brand-dot" />MirrorView</div><div className={`connection-pill ${connected ? "online" : "offline"}`}><span className="status-dot" />{connected ? "Connected" : "Public preview"}</div></div>
      <div className="viewer-content"><p className="eyebrow">MOBILE PREVIEW</p><h1>Live shared interface</h1><p className="viewer-description">This view is synchronized with the MirrorView control center when running locally.</p><PhonePreview state={state} /><p className="viewer-footnote">You opened the correct GitHub Pages viewer URL.</p></div>
    </main>
  );
}

function PhonePreview({ state }: { state: MirrorState }) {
  return <div className="phone-frame"><div className="phone-speaker" /><div className="phone-screen"><div className="phone-statusbar"><span>9:41</span><span>● ● ▰</span></div><div className="preview-gradient" style={{ background: `linear-gradient(135deg, ${state.accent}, #111a35)` }}><div className="preview-icon">✦</div><span className="preview-kicker">MIRRORVIEW PREVIEW</span><h3>{state.title || "Untitled preview"}</h3><p>{state.message || "No message yet."}</p><button className="preview-button" style={{ backgroundColor: state.accent }}>Continue</button></div><div className="preview-bottom-nav"><span className="active">Home</span><span>Activity</span><span>Profile</span></div></div></div>;
}
