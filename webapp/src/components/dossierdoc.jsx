import { TERMINAL_META, hopDecay } from "../lib/hawkes.js";
import { fmtINR } from "../lib/format.js";

// Section-102 BNSS dossier body. Shared by the Reports pane and the per-node
// EXPORT REPORT on the case card, so both surfaces stay identical.
// NOTE: keep this markup free of color-mix() — html2canvas cannot parse it.
export default function DossierDoc({ nodeId, rows = [], reportRef, today, bnssStrict, provenance }) {
  const meta = TERMINAL_META[nodeId] || { city: "—", zone: "—" };
  const disputedTotal = rows.reduce((a, c) => a + (Number(c.disputed_amount_inr) || 0), 0);
  const src = provenance || (rows[0] && rows[0].source) || "LIVE";

  return (
    <div
      style={{
        background: "var(--bg-core)",
        color: "var(--text-main)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          borderBottom: "2px solid var(--accent-cyan)",
          paddingBottom: 8,
          marginBottom: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent-cyan)" }}>
            INDIAN CYBER CRIME COORDINATION CENTRE (I4C)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            CIS DIVISION · NATIONAL PREDICTIVE MITIGATION UNIT
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>
          REF: <b style={{ color: "var(--text-main)" }}>{reportRef}</b>
          <br />
          DATE: {today}
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>NIRAKSHAN — CASE DOSSIER</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Section 102 BNSS · lien restricted to disputed value only · Node {nodeId} ({meta.city})
      </div>

      <table className="w-full" style={{ fontSize: 12 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
            <th style={{ padding: "4px 0" }}>ACK</th>
            <th>Victim VPA</th>
            <th>Amount (disputed)</th>
            <th>Hop</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ color: "var(--text-dim)", paddingTop: 8 }}>
                No buffered complaints for this node.
              </td>
            </tr>
          ) : (
            rows.slice(0, 25).map((c, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "4px 0" }}>{c.ack_no}</td>
                <td>{c.victim_vpa}</td>
                <td>{fmtINR(c.disputed_amount_inr)}</td>
                <td>{c.hop_count}</td>
                <td>{c.timestamp}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--accent-cyan)" }}>
            <td colSpan={2} style={{ paddingTop: 6 }}>
              <b>Total (disputed only)</b>
            </td>
            <td style={{ paddingTop: 6 }}>
              <b>{fmtINR(disputedTotal)}</b>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <div className="hud-label" style={{ marginTop: 12, marginBottom: 4 }}>
        1. EVIDENTIARY LINEAGE &amp; CONTRIBUTING NCRP CHAINS
      </div>
      <ul style={{ margin: "0 0 12px 16px", fontSize: 12, color: "var(--text-muted)" }}>
        {rows.length === 0 ? (
          <li>No buffered complaints for this node.</li>
        ) : (
          rows.slice(0, 3).map((c, i) => (
            <li key={i} style={{ marginBottom: 3 }}>
              <b style={{ color: "var(--text-main)" }}>{c.ack_no}</b> · disputed {fmtINR(c.disputed_amount_inr)} ·
              hops {c.hop_count} (α^{c.hop_count} = {hopDecay(c.hop_count).toFixed(3)})
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Lineage: {c.victim_vpa} &rarr; mule_tier1 &rarr; mule_tier2 &rarr; {c.target_terminal_id}
              </div>
            </li>
          ))
        )}
      </ul>

      <div style={{ border: "1px solid var(--warn)", background: "rgba(245, 158, 11, 0.14)", padding: 10, borderRadius: 4, marginBottom: 12 }}>
        <div className="hud-label" style={{ color: "var(--warn)", marginBottom: 4 }}>
          2. STATUTORY MANDATE &amp; PROPORTIONALITY LIMITS
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
          Any proactive account or terminal lien is restricted exclusively to the disputed amount, capped at{" "}
          <b style={{ color: "var(--text-main)" }}>{fmtINR(disputedTotal)}</b>. Blanket freezes or full account
          suspensions at intermediate mule tiers are prohibited.
        </p>
      </div>

      <div
        style={{
          borderTop: "1px dashed var(--border)",
          paddingTop: 8,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-dim)",
        }}
      >
        <span>DISPATCHED TO: JURISDICTIONAL POLICE CELL / BANK NODAL WATCH</span>
        <span>SECURITY CLEARANCE: LEA RESTRICTED · NON-PUBLIC</span>
      </div>

      <p style={{ fontSize: 12, color: bnssStrict ? "var(--ok)" : "var(--warn)", marginTop: 10 }}>
        BNSS strict mode: {bnssStrict ? "ON — cap enforced at disputed value." : "OFF — enable in SYSTEM before issuing lien."}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
        Generated by NIRAKSHAN console · provenance: {src}.
      </p>
    </div>
  );
}
