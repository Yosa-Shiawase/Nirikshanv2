// app.py anomaly-fix harness: raw SSE listener + burst injection + regressions.
import http from "node:http";

const BASE = "http://localhost:8080";
const TERM = "BLR-01";

const frames = [];
let buf = "";
const req = http.get(`${BASE}/events`, (res) => {
  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    buf += chunk;
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const line = p.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        frames.push(JSON.parse(line.slice(5).trim()));
      } catch (err) {
        /* ignore */
      }
    }
  });
});
req.on("error", (e) => {
  console.log(JSON.stringify({ sseError: String(e.message) }));
  process.exit(1);
});

const post = async (body) => {
  const r = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await sleep(900); // let SSE attach
  const t0 = Date.now();

  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await post({ target_terminal_id: TERM, victim_vpa: "anomaly.test@icici", disputed_amount_inr: 45000, hop_count: 2, source: "WEB" })
    );
    await sleep(250);
  }
  await sleep(4000);

  const anomalies = frames.filter((f) => f && f.type === "anomaly");
  const mine = anomalies.filter((f) => f.terminal_id === TERM);
  const complaints = frames.filter((f) => f && f.ack_no);
  const smsFrames = frames.filter((f) => f && f.type === "sms_alert");

  const health = await (await fetch(`${BASE}/health`)).json();
  const trace = await (await fetch(`${BASE}/case/trace`)).json();
  const brief = await (await fetch(`${BASE}/ai/briefing`)).json();
  const sms = await (
    await fetch(`${BASE}/sms-plain`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "REG|kyc blocked share otp" })
  ).json();
  const one = await post({ target_terminal_id: TERM, victim_vpa: "regress@icici", disputed_amount_inr: 1000, hop_count: 1, source: "WEB" });

  console.log(
    JSON.stringify(
      {
        windowMs: Date.now() - t0,
        ingest6Ok: results.length === 6 && results.every((r) => r && r.ok),
        sseFrames: frames.length,
        sseComplaintFrames: complaints.length,
        anomalyFramesForTestTerminal: mine.length,
        anomalyFramesTotal: anomalies.length,
        anomalySample: anomalies.slice(0, 3),
        smsFramesSeen: smsFrames.length,
        regression: {
          healthOk: health.ok === true,
          healthClients: health.clients,
          caseTraceLayers: (trace.layers || []).length,
          caseTraceLiveEvents: trace.total_live_events,
          briefingEngine: brief.engine,
          smsVerdict: sms.verdict,
          ingestOneOk: !!(one && one.ok === true),
        },
      },
      null,
      2
    )
  );
  req.destroy();
  process.exit(0);
}

main();
