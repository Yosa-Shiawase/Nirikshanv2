import { useEffect, useState } from "react";
import { useLiveFeed } from "../live/useLiveFeed";
import { useTheme } from "../context/ThemeContext";
import { THEMES } from "../lib/theme";

export function Clock({ className = "" }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return (
    <span className={className} title={now.toISOString()}>
      {hh}:{mm}:{ss}
    </span>
  );
}

export function LiveDot({ connected }) {
  return (
    <span className="inline-flex items-center gap-2" title={connected ? "SSE live" : "SSE reconnecting"}>
      <span
        className="live-dot"
        style={connected ? undefined : { background: "var(--warn)", boxShadow: "0 0 10px var(--warn)" }}
      />
      <span className="hud-label" style={{ letterSpacing: "0.2em" }}>
        {connected ? "LIVE" : "LINK…"}
      </span>
    </span>
  );
}

export default function TopBar({ onOpenBriefing, onOpenSystem, alertsArmed, onToggleAlerts }) {
  const { connected, counters, lastEventAt } = useLiveFeed();
  const { theme, cycleTheme } = useTheme();
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setAgo(lastEventAt ? Math.round((Date.now() - lastEventAt) / 1000) : -1);
    }, 1000);
    return () => clearInterval(id);
  }, [lastEventAt]);

  const themeLabel = THEMES.find((t) => t.id === theme)?.label || theme;

  return (
    <header
      className="flex items-center gap-3 px-3 md:px-4 h-14 border-b"
      style={{ background: "var(--bg-z1)", borderColor: "var(--border)" }}
    >
      <img
        id="brand-logo"
        alt="NIRAKSHAN"
        src={`${import.meta.env.BASE_URL || "/"}sih.png`}
        className="h-9 w-auto shrink-0"
        style={{ filter: "drop-shadow(0 0 10px var(--glow))" }}
      />
      <button
        type="button"
        onClick={onOpenSystem}
        className="text-left flex flex-col leading-none"
        title="Open System pane"
      >
        <span className="text-sm md:text-base font-semibold glow-text" style={{ color: "var(--accent-cyan)" }}>
          NIRAKSHAN
        </span>
        <span className="hud-label" style={{ fontSize: "12px", letterSpacing: "0.18em" }}>
          CYBERCRIME PREDICTION CONSOLE
        </span>
      </button>

      <div className="hidden lg:flex items-center gap-2 ml-3">
        <span className="hud-chip" title="complaints ingested this session">
          INGEST <b style={{ color: "var(--text-main)" }}>{counters.total}</b>
        </span>
        <span className="hud-chip" title="complaint events">
          CRIME <b style={{ color: "var(--text-main)" }}>{counters.complaints}</b>
        </span>
        <span className="hud-chip" title="anomaly events">
          ANOM <b style={{ color: "var(--text-main)" }}>{counters.anomalies}</b>
        </span>
      </div>

      <div className="flex-1" />

      <LiveDot connected={connected} />
      <span className="hidden sm:inline hud-label" style={{ letterSpacing: "0.14em" }}>
        {ago < 0 ? "—" : `${ago}s`}
      </span>

      <button type="button" className="hud-btn hidden md:inline-flex" onClick={onOpenBriefing} title="AI briefing">
        AI BRIEFING
      </button>

      <button
        type="button"
        className="hud-btn hidden md:inline-flex"
        onClick={onToggleAlerts}
        title="Arm/disarm the SMS siren"
        style={
          alertsArmed
            ? { borderColor: "var(--danger)", color: "var(--danger)", boxShadow: "0 0 16px var(--danger)" }
            : undefined
        }
      >
        {alertsArmed ? "ALERTS ARMED" : "ENABLE ALERTS"}
      </button>

      <button type="button" className="hud-btn" onClick={cycleTheme} title={`Theme: ${themeLabel}`}>
        ◐ <span className="hidden xl:inline">{themeLabel}</span>
      </button>

      <Clock className="hud-label tabular-nums" />
    </header>
  );
}
