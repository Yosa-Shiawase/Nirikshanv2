# NIRAKSHAN — Predictive Cybercrime Intelligence Console
### SIH 2026 · PS 26184 (MHA) — Forecasting likely cash-withdrawal locations from cybercrime complaint streams

> "We watch, so you're safe."

**Live:** https://nirikshanv2.onrender.com *(first boot: 60s boot sequence, once per session)*

**Demo video:** https://youtu.be/27NCGUmb9SQ

![Live risk map with real ATM layer](docs/atms.png)

![QR forensic verdict — FLAGGED_FRAUD_RISK](docs/verdict.png)

![AI situation briefing](docs/briefing.png)

![Fraud QR demo payload](docs/fraud-qr.png)

## Architecture

    [SIM NCRP stream]───┐
    [WEB/SMS ingest]────┼──> app.py (single process) ──> SSE /events ──> live dashboard
    [QR camera scan]────┘         │
                                  ├─ /atms ────────> REAL ATMs near hot node (OSM)
                                  ├─ /qr/verify ───> NPCI-rule UPI URI forensics
                                  └─ /ai/briefing ─> LLM briefing (Gemini / rules fallback)
                           SQLite (live_data.db) — every complaint persisted

## Server files

| File | Role |
|---|---|
| app.py | **Production** — unified static + API + SSE + AI server (use this) |
| server.py | Legacy static-only server (superseded) |
| live.py | Legacy standalone ingest service (superseded) |

## Capability provenance

| Capability | Status |
|---|---|
| Hawkes spatio-temporal risk engine | ✅ Real math — self-exciting process, hop attenuation, spatial kernel |
| Live ingestion (SSE) + SQLite | ✅ Real pipeline, queryable history |
| ATM/bank layer | ✅ Real data — OpenStreetMap Overpass, dual endpoint failover |
| QR fraud heuristics | ✅ Real NPCI-rule engine — PSP allowlist, SE-keywords, watchlist |
| Camera QR scanning | ✅ Native BarcodeDetector + ZXing fallback, torch/zoom |
| EWMA burst anomaly detector | ✅ Unsupervised AI on the live stream |
| LLM briefings | ✅ Gemini (optional) with rules fallback — never dark |
| NCRP complaint stream | 🟡 Simulated adapter — no public API; drop-in swap when granted |

## Stack

Frontend: vanilla ES6 + Leaflet + ZXing — zero build step.
Backend: Python stdlib only — one process, deploys anywhere.
Deploy: Render free tier, auto-deploy on push to main.

## Run locally

    python app.py   →   http://localhost:8080
