import { useLiveFeed } from "../live/useLiveFeed";
import { useConsole } from "../context/ConsoleContext";
import NodeCaseCard from "./NodeCaseCard";
import Provenance from "./Provenance";
import { fmtINR, secondsAgo } from "../lib/format";

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: tone || "var(--text-main)" }}>{value}</span>
    </div>
  );
}

// Shared context content: primary Node Case Card + stream health + tail.
// Used by the desktop context drawer AND the mobile context sheet.
export default function ContextPanel() {
  const { complaints, anomalies, smsAlerts, counters, connected } = useLiveFeed();
  const { setSelectedNode, selectedNode } = useConsole();

  return (
    <div className="flex flex-col gap-3">
      <NodeCaseCard />

      <section className="hud-panel p-3">
        <div className="hud-label mb-2">Stream Health</div>
        <Row label="SSE link" value={connected ? "CONNECTED" : "RECONNECTING"} tone={connected ? "var(--ok)" : "var(--warn)"} />
        <Row label="Complaints" value={counters.complaints} />
        <Row label="Anomalies" value={counters.anomalies} tone="var(--danger)" />
        <Row label="SMS alerts" value={counters.sms} tone="var(--warn)" />
      </section>

      <section className="hud-panel p-3">
        <div className="hud-label mb-2">Live Complaint Tail</div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>Tap a row to focus that node.</p>
        {complaints.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Waiting for the next event…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {complaints.slice(0, 6).map((c, i) => (
              <li key={(c.ack_no || "c") + i}>
                <button
                  type="button"
                  onClick={() => setSelectedNode(c.target_terminal_id || selectedNode)}
                  className="w-full text-left rounded-md px-2 py-1.5"
                  style={{
                    background:
                      c.target_terminal_id === selectedNode
                        ? "color-mix(in srgb, var(--accent-cyan) 14%, transparent)"
                        : "var(--bg-z2)",
                    border: "1px solid var(--border)",
                    minHeight: 44,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 12, color: "var(--accent-cyan)" }}>{c.ack_no || "ACK—"}</span>
                    <Provenance source={c.source} />
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    <span className="truncate">{c.victim_vpa || "—"}</span>
                    <span>{fmtINR(c.disputed_amount_inr)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {c.target_terminal_id || "—"} · {secondsAgo(c.timestamp)}s ago
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hud-panel p-3">
        <div className="hud-label mb-2">Anomaly Watch</div>
        {anomalies.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>No anomaly pulses yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {anomalies.slice(0, 4).map((a, i) => (
              <li key={i} style={{ fontSize: 12, color: "var(--danger)" }}>
                ⚠ {a.terminal_id} · {a.count_30s}/30s vs base {a.baseline}
              </li>
            ))}
          </ul>
        )}
        {smsAlerts.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--warn)", marginTop: 6 }}>SMS alerts buffered: {smsAlerts.length}</p>
        )}
      </section>
    </div>
  );
}
