import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every backend route the frontend speaks. Kept in one list so the dev proxy
// and any future prod needs stay in sync with app.py.
const API_ROUTES = [
  "/events", // GET  SSE live complaint / anomaly / sms_alert stream
  "/atms", // GET  real ATM + banks (OSM Overpass, may return degraded:true)
  "/case", // GET  /case/trace stolen-amount laundering split
  "/ai", // GET  /ai/briefing
  "/sms-plain", // POST "sender|text" -> SMS rule verdict
  "/sms", // GET  legacy feed
  "/ingest-sms", // POST legacy
  "/ingest", // POST complaint
  "/qr", // POST /qr/verify
  "/api", // POST /api/verify-qr
  "/health", // GET
];

const proxy = {};
for (const route of API_ROUTES) {
  proxy[route] = {
    target: "http://localhost:8080",
    changeOrigin: true,
    ws: false,
    // SSE must not be buffered by the dev proxy.
    configure: (p) => {
      p.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader("Accept-Encoding", "identity");
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  // Absolute base: the app is served at the site root by app.py (dist is
  // committed for Render), so every asset URL resolves identically from the
  // document AND from stylesheets (CSS custom properties holding url()).
  base: "/",
  server: {
    host: true,
    port: 5173,
    proxy,
  },
  preview: {
    host: true,
    port: 4173,
    proxy,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
