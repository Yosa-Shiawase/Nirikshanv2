import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConsole } from "../context/ConsoleContext";
import { useLiveFeed } from "../live/useLiveFeed";
import { TERMINAL_META, evaluateTerminal, hawkesIntensity, hopDecay, rankTerminals } from "../lib/hawkes";
import { NODE_BY_ID } from "../lib/terminals";
import { fmtINR, fmtCompactINR, riskTone, secondsAgo } from "../lib/format";
import { exportElementToPdf } from "../lib/exportPdf";
import Provenance from "./Provenance";
import DossierDoc from "./DossierDoc";

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: tone || "var(--text-main)" }}>{value}</span>
    </div>
  );
}

// PRIMARY context content: the focused node's case card.
// Also owns the per-node EXPORT REPORT (shared by the desktop drawer and the
// mobile case sheet, since both render this component).
export default function NodeCaseCard() {
  const { complaints } = useLiveFeed();
  const { selectedNode, hawkes, horizonHours, bnssStrict, isWatched, toggleWatch } = useConsole();

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const dossierRef = useRef(null);

  const reportRef = useMemo(() => "AIR-I4C-" + String(Date.now()).slice(-6), [exportOpen]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  // Render the dossier on screen (html2canvas needs a laid-out node), then export.
  useEffect(() => {
    if (!exportOpen) return undefined;
    let cancelled = false;
    setExporting(true);
    setExportMsg("");
    const t = setTimeout(async () => {
      try {
        await exportElementToPdf(dossierRef.current, `NIRAKSHAN-dossier-${selectedNode}.pdf`);
        if (!cancelled) setExportMsg("PDF downloaded.");
      } catch (err) {
        if (!cancelled) setExportMsg("Export failed: " + String(err.message || err));
      } finally {
        if (!cancelled) setExporting(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [exportOpen, selectedNode]);

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
        <Row
          label="Map score (/100)"
          value={stats.forecast ? stats.forecast.score : "—"}
          tone={stats.forecast ? riskTone(stats.forecast.score) : undefined}
        />
        <Row label="Projected flow" value={stats.forecast ? fmtCompactINR(stats.forecast.projectedFlow) : "—"} />
        <Row label="Complaints (buffered)" value={stats.rows.length} />
        <Row label="Disputed total" value={fmtINR(stats.total)} tone="var(--danger)" />
        <Row label="Avg ticket" value={fmtINR(stats.avg)} />
        <Row label="Last event" value={stats.last ? `${secondsAgo(stats.last.timestamp)}s ago` : "—"} />
        <Row label="Top victim VPA" value={stats.topVictim ? stats.topVictim[0] : "—"} />
        <Row label="Sec-102 lien cap" value={fmtCompactINR(lien)} tone={bnssStrict ? "var(--warn)" : "var(--text-main)"} />
      </div>

      <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: stats.topVictim ? "1fr 1fr" : "1fr" }}>
        <button
          type="button"
          className="hud-btn"
          onClick={() => setExportOpen(true)}
          style={{ minHeight: 44, borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}
        >
          EXPORT REPORT
        </button>
        {stats.topVictim && (
          <button
            type="button"
            className="hud-btn"
            onClick={() => toggleWatch(stats.topVictim[0])}
            style={{ minHeight: 44 }}
          >
            {isWatched(stats.topVictim[0]) ? "★ ON WATCHLIST" : "☆ ADD VPA TO WATCHLIST"}
          </button>
        )}
      </div>

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

      {exportOpen &&
        createPortal(
          <div className="fixed inset-0 z-[1300] flex items-start justify-center p-3" role="dialog" aria-modal="true" aria-label={`Dossier for ${selectedNode}`}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setExportOpen(false)}
              className="absolute inset-0"
              style={{ background: "rgba(1,5,7,0.74)" }}
            />
            <div
              className="hud-panel relative fade-in"
              style={{ width: "min(860px, 100%)", maxHeight: "88dvh", overflow: "auto", padding: 12 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 8 }}>
                <div className="hud-label">EXPORT REPORT · {selectedNode}</div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 12, color: exporting ? "var(--text-muted)" : "var(--ok)" }}>
                    {exporting ? "Rendering PDF…" : exportMsg}
                  </span>
                  <button type="button" className="hud-btn" onClick={() => setExportOpen(false)} style={{ minHeight: 36 }}>
                    CLOSE
                  </button>
                </div>
              </div>
              <div ref={dossierRef} style={{ background: "var(--bg-core)" }}>
                <DossierDoc
                  nodeId={selectedNode}
                  rows={stats.rows}
                  reportRef={reportRef}
                  today={today}
                  bnssStrict={bnssStrict}
                  provenance={stats.last && stats.last.source}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
