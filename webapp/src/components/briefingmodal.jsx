import { useEffect, useState } from "react";
import api from "../lib/api.js";

// F11 AI BRIEFING modal — pulls GET /ai/briefing ({ engine, text }).
export default function BriefingModal({ open, onClose }) {
  const [state, setState] = useState({ loading: false, engine: "", text: "", error: "" });

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setState({ loading: true, engine: "", text: "", error: "" });
    api
      .aiBriefing()
      .then((d) => {
        if (!alive) return;
        setState({
          loading: false,
          engine: d?.engine || "unknown",
          text: d?.text || "(empty briefing)",
          error: "",
        });
      })
      .catch((e) => {
        if (!alive) return;
        setState({ loading: false, engine: "", text: "", error: String(e.message || e) });
      });
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-3" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(1,5,7,0.7)" }} />
      <div
        className="hud-panel relative fade-in flex flex-col"
        style={{ width: "min(720px, 100%)", maxHeight: "80dvh" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="hud-label">AI BRIEFING</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              engine: {state.engine || (state.loading ? "…" : "—")}
            </div>
          </div>
          <button type="button" className="hud-btn" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <div className="p-4 overflow-y-auto" style={{ fontSize: 14, color: "var(--text-main)", whiteSpace: "pre-wrap" }}>
          {state.loading && <span style={{ color: "var(--text-muted)" }}>Generating briefing…</span>}
          {state.error && <span style={{ color: "var(--danger)" }}>Briefing unavailable: {state.error}</span>}
          {!state.loading && !state.error && state.text}
        </div>
      </div>
    </div>
  );
}
