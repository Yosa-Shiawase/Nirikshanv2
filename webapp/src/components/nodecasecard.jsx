import { useMemo } from "react";
import { useConsole } from "../context/ConsoleContext";
import { useLiveFeed } from "../live/useLiveFeed";
import { TERMINAL_META, evaluateTerminal, hawkesIntensity, hopDecay, rankTerminals } from "../lib/hawkes";
import { NODE_BY_ID } from "../lib/terminals";
import { fmtINR, fmtCompactINR, riskTone, secondsAgo } from "../lib/format";
import Provenance from "./Provenance";

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: tone || "var(--text-main)" }}>{value}</span>
    </div>
  );
}

// PRIMARY context-drawer content (T2 term): the focused node's case card.
export default function NodeCaseCard() {
  const { complaints } = useLiveFeed();
  const { selectedNode, hawkes, horizonHours, bnssStrict, isWatched, toggleWatch } = useConsole();

  const stats = useMemo(() => {
    const rows = complaints.filter((c) => c && c.target_terminal_id === selectedNode);
    const total = rows.reduce((a, c) => a + (Number(c.disputed_amount_inr) || 0), 0);
    const lama = hawkesIntensity(complaints, selectedNode, hawkes, horizonHours);
    const ranked = rankTerminals(complaints, hawkes, horizonHours);
    const rank = ranked.findIndex((r) => r.terminal === selectedNode) + 1;
    const victimCounts = {};
    const hopCounts = {};
    for (const c of rows) {
      victimCounts[c.victim_vpa] = (victimCounts[c.victim_vpa] || 0) + 1;
      const h = Number(c.hop_count) || 1;
      hopCounts[h] = (hopCounts[h] || 0) + 1;
    }
    const topVictim = Object.entries(victimCounts).sort((a, b) => b[1] - a[1])[0];
    const last = rows[0] || null;
    const avg = rows.length ? Math.round(total / rows.length) : 0;
    const node = NODE_BY_ID[selectedNode];
    const forecast = node ? evaluateTerminal(node, horizonHours, hawkes) : null;
    return { rows, total, lama, rank, ranked, topVictim, hopCounts, last, avg, forecast };
  }, [complaints, selectedNode, hawkes, horizonHours]);

  const meta = TERMINAL_META[selectedNode] || { city: "—", zone: "—" };
  // Section-102 lien is capped at the DISPUTED value only.
  const lien = bnssStrict ? Math.min(stats.avg, 50000) : stats.total;

  return (
    <section className="hud-panel p-3" aria-label="Node case card">
      <div className="flex items-center justify-between mb-2">
        <div className="hud-label">CASE CARD</div>
        {stats.last && <Provenance source={stats.last.source} />}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-lg font-semibold glow-text" style={{ color: "var(--accent-cyan)" }}>
            {selectedNode}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {meta.city} · {meta.zone}
          </div>
        </div>
        <div className="text-right">
          <div className="hud-label">Hawkes λ</div>
          <div className="text-lg font-semibold" style={{ color: "var(--warn)" }}>
            {stats.lama.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>rank #{stats.rank || "—"}</div>
        </div>
      </div>

      <div className="mt-2">
        <Row label="Map score (/100)" value={stats.forecast ? stats.forecast.score : "—"} tone={stats.forecast ? riskTone(stats.forecast.score) : undefined} />
        <Row label="Projected flow" value={stats.forecast ? fmtCompactINR(stats.forecast.projectedFlow) : "—"} />
        <Row label="Complaints (buffered)" value={stats.rows.length} />
        <Row label="Disputed total" value={fmtINR(stats.total)} tone="var(--danger)" />
        <Row label="Avg ticket" value={fmtINR(stats.avg)} />
        <Row
          label="Last event"
          value={stats.last ? `${secondsAgo(stats.last.timestamp)}s ago` : "—"}
        />
        <Row
          label="Top victim VPA"
          value={stats.topVictim ? stats.topVictim[0] : "—"}
        />
        <Row label="Sec-102 lien cap" value={fmtCompactINR(lien)} tone={bnssStrict ? "var(--warn)" : "var(--text-main)"} />
      </div>

      {stats.topVictim && (
        <button
          type="button"
          className="hud-btn w-full mt-3"
          onClick={() => toggleWatch(stats.topVictim[0])}
          style={{ minHeight: 44 }}
        >
          {isWatched(stats.topVictim[0]) ? "★ ON WATCHLIST" : "☆ ADD VPA TO WATCHLIST"}
        </button>
      )}

      <div className="mt-3">
        <div className="hud-label mb-1">MONEY CHAIN (each hop × {hawkes.alpha})</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(stats.hopCounts).length === 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>no hops buffered</span>
          )}
          {Object.entries(stats.hopCounts)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([hop, n]) => (
              <span key={hop} className="hud-chip" title={`hop ${hop} · decay ${hopDecay(hop, hawkes.alpha).toFixed(4)}`}>
                h{hop}×{n} · {hopDecay(hop, hawkes.alpha).toFixed(3)}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}
