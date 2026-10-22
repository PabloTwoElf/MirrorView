import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";

type MirrorState = { title: string; message: string; accent: string; updatedAt: number };
const state: MirrorState = { title: "Hello from MirrorView", message: "Edit this content on your computer and see it update here.", accent: "#7c5cff", updatedAt: Date.now() };

function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function mirrorApi(): Plugin {
  return {
    name: "mirror-view-local-api",
    configureServer(server) {
      server.middlewares.use("/api/network-info", (_req, res) => {
        const port = Number(server.config.server.port ?? 5173);
        const addresses = getLanAddresses();
        sendJson(res, 200, { addresses, port, urls: addresses.map((address) => `http://${address}:${port}`) });
      });
      server.middlewares.use("/api/state", async (req, res) => {
        if (req.method === "GET") return sendJson(res, 200, state);
        if (req.method === "POST") {
          try {
            const incoming = (await readJsonBody(req)) as Partial<MirrorState>;
            if (typeof incoming.title === "string") state.title = incoming.title.slice(0, 120);
            if (typeof incoming.message === "string") state.message = incoming.message.slice(0, 500);
            if (typeof incoming.accent === "string" && /^#[0-9a-f]{6}$/i.test(incoming.accent)) state.accent = incoming.accent;
            state.updatedAt = Date.now();
            return sendJson(res, 200, state);
          } catch { return sendJson(res, 400, { error: "Invalid request body" }); }
        }
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.end("Method Not Allowed");
      });
    },
  };
}

export default defineConfig({ plugins: [react(), mirrorApi()], server: { host: true, port: 5173, strictPort: true } });
