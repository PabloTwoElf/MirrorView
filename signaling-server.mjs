import http from "node:http";
import os from "node:os";
import { WebSocketServer } from "ws";

const SIGNALING_PORT = Number(process.env.PORT || process.env.SIGNALING_PORT || 5174);

const rooms = new Map();

function getRoom(session) {
  if (!rooms.has(session)) {
    rooms.set(session, { sender: null, receiver: null });
  }
  return rooms.get(session);
}

function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }
  return [...new Set(addresses)];
}

function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(payload));
}

function relay(room, fromRole, payload) {
  const peer = fromRole === "sender" ? room.receiver : room.sender;
  if (!peer || peer.readyState !== 1) return;
  peer.send(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (!req.url) return sendJson(res, { error: "Invalid request" }, 400);
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.end();
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/network-info") {
    const appPort = Number(requestUrl.searchParams.get("appPort") || 5173);
    const basePath = requestUrl.searchParams.get("basePath") || "/";
    const addresses = getLanAddresses();
    const appUrls = addresses.map((address) => new URL(basePath, `http://${address}:${appPort}`).toString());
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0]?.trim();
    const signalingProtocol = forwardedProto === "https" ? "wss" : "ws";
    return sendJson(res, { addresses, appUrls, signaling: `${signalingProtocol}://${req.headers.host}` });
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return sendJson(res, { status: "ok" });
  }

  sendJson(res, { error: "Not found" }, 404);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let currentSession = null;
  let currentRole = null;

  ws.on("message", (raw) => {
    try {
      const incoming = JSON.parse(raw.toString());
      if (incoming.type === "join") {
        const { session, role } = incoming;
        if (!session || (role !== "sender" && role !== "receiver")) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid join payload" }));
          return;
        }

        currentSession = session;
        currentRole = role;

        const room = getRoom(session);
        const existing = room[role];
        if (existing && existing !== ws && existing.readyState === 1) {
          existing.send(JSON.stringify({ type: "peer-disconnected", session, role, reason: "Nueva conexión reemplazó esta sesión." }));
          existing.close();
        }

        room[role] = ws;
        relay(room, role, { type: "peer-joined", session, role });
        return;
      }

      if (!currentSession || !currentRole) {
        ws.send(JSON.stringify({ type: "error", message: "Join is required first" }));
        return;
      }

      const room = getRoom(currentSession);
      if (["offer", "answer", "ice", "stop"].includes(incoming.type)) {
        relay(room, currentRole, { ...incoming, session: currentSession });
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid signaling message" }));
    }
  });

  ws.on("close", () => {
    if (!currentSession || !currentRole) return;

    const room = getRoom(currentSession);
    if (room[currentRole] === ws) {
      room[currentRole] = null;
      relay(room, currentRole, { type: "peer-disconnected", session: currentSession, role: currentRole, reason: "Peer disconnected" });
    }

    if (!room.sender && !room.receiver) {
      rooms.delete(currentSession);
    }
  });
});

server.listen(SIGNALING_PORT, "0.0.0.0", () => {
  console.log(`[mirrorview] signaling server listening on http://0.0.0.0:${SIGNALING_PORT}`);
});
