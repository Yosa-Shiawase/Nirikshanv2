import { useLiveFeed } from "../live/useLiveFeed";

function fmtINR(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return "₹" + v.toLocaleString("en-IN");
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: tone || "var(--text-main)" }}>{value}</span>
    </div>
  );
}

export default function ContextDrawer() {
  const { complaints, anomalies, smsAlerts, counters, connected } = useLiveFeed();

  return (
    <aside
      className="flex flex-col gap-3 p-3 overflow-y-auto border-l"
      style={{ background: "var(--bg-z1)", borderColor: "var(--border)", width: 336 }}
      aria-label="Context"
    >
      <section className="hud-panel p-3">
        <div className="hud-label mb-2">Stream Health</div>
        <Row label="SSE link" value={connected ? "CONNECTED" : "RECONNECTING"} tone={connected ? "var(--ok)" : "var(--warn)"} />
        <Row label="Complaints" value={counters.complaints} />
        <Row label="Anomalies" value={counters.anomalies} tone="var(--danger)" />
        <Row label="SMS alerts" value={counters.sms} tone="var(--warn)" />
      </section>

      <section className="hud-panel p-3">
        <div className="hud-label mb-2">Live Complaint Tail</div>
        {complaints.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Waiting for the next event… start the backend and inject a complaint.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {complaints.slice(0, 6).map((c, i) => (
              <li
                key={(c.ack_no || "c") + i}
                className="rounded-md px-2 py-1.5"
                style={{ background: "var(--bg-z2)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, color: "var(--accent-cyan)" }}>{c.ack_no || "ACK—"}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.target_terminal_id || "—"}</span>
                </div>
                <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  <span>{c.victim_vpa || "—"}</span>
                  <span>{fmtINR(c.disputed_amount_inr)}</span>
                </div>
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
          <p style={{ fontSize: 13, color: "var(--danger)" }}>⚠ {anomalies.length} recent pulse(s)</p>
        )}
        {smsAlerts.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--warn)", marginTop: 6 }}>SMS alerts buffered: {smsAlerts.length}</p>
        )}
      </section>
    </aside>
  );
}
