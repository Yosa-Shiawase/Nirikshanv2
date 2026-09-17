// Provenance label (F11) — every data surface tags whether a value is
// SIMulated (backend simulator) or LIVE (real ingest / real external source).
export default function Provenance({ source, style }) {
  const s = String(source || "").toUpperCase();
  const isSim = s === "SIM";
  const isLive = !isSim;
  const tone = isSim ? "var(--text-muted)" : "var(--ok)";
  return (
    <span
      className="hud-chip"
      title={isSim ? "Simulated NCRP-sim stream" : `Live source: ${source || "ingest"}`}
      style={{ borderColor: tone, color: tone, ...style }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: tone, display: "inline-block" }}
      />
      {isLive ? "LIVE" : "SIM"}
    </span>
  );
}
