import { useEffect, useRef, useState } from "react";
import { useLiveFeed } from "../live/uselivefeed.jsx";
import { useConsole } from "../context/consolecontext.jsx";
import { primeAudio, startSiren, stopSiren, vibrate } from "../lib/siren.js";
import { riskTone } from "../lib/format.js";

const SIREN_COOLDOWN_MS = 30000; // F4: 30s siren cooldown
const BANNER_MS = 9000;

// Global alarm: red banner + siren + vibration, armed by ENABLE ALERTS (F4).
export default function AlertBanner() {
  const { smsAlerts } = useLiveFeed();
  const { alertsArmed } = useConsole();
  const [alert, setAlert] = useState(null);
  const lastAlarmAt = useRef(0);
  const lastSeen = useRef(null);
  const hideTimer = useRef(null);

  // Fire on each NEW high-risk sms_alert while armed.
  useEffect(() => {
    const latest = smsAlerts[0];
    if (!latest) return;
    const id = `${latest.ts}|${latest.sender}|${latest.risk_score}`;
    if (id === lastSeen.current) return;
    lastSeen.current = id;
    if (!alertsArmed) return;
    if ((Number(latest.risk_score) || 0) < 20) return;

    setAlert(latest);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setAlert(null), BANNER_MS);

    const now = Date.now();
    if (now - lastAlarmAt.current >= SIREN_COOLDOWN_MS) {
      lastAlarmAt.current = now;
      startSiren(4000);
      vibrate();
    }
  }, [smsAlerts, alertsArmed]);

  useEffect(() => () => stopSiren(), []);

  if (!alert) return null;

  const tone = riskTone(alert.risk_score);
  return (
    <div
      role="alert"
      className="fixed left-0 right-0 z-[1250] flex items-center gap-3 px-3 py-2"
      style={{
        top: "env(safe-area-inset-top)",
        background: "color-mix(in srgb, var(--danger) 26%, var(--bg-core))",
        borderBottom: `2px solid var(--danger)`,
        boxShadow: "0 0 26px var(--danger)",
      }}
    >
      <span style={{ fontSize: 20 }} aria-hidden="true">🚨</span>
      <div className="min-w-0 flex-1">
        <div className="hud-label" style={{ color: "var(--text-main)", letterSpacing: "0.2em" }}>
          SMS THREAT · {alert.verdict || "ALERT"}
        </div>
        <div className="truncate" style={{ fontSize: 13, color: "var(--text-main)" }}>
          {alert.sender || "unknown"} — {alert.text || ""}
        </div>
      </div>
      <span className="hud-chip" style={{ borderColor: tone, color: tone }}>
        risk {alert.risk_score}
      </span>
      <button
        type="button"
        className="hud-btn"
        style={{ minHeight: 40 }}
        onClick={() => {
          stopSiren();
          setAlert(null);
        }}
      >
        SILENCE
      </button>
    </div>
  );
}

/** Reusable arm/disarm button (uses the arming click as the audio gesture). */
export function AlertsToggle({ compact = false }) {
  const { alertsArmed, armAlerts } = useConsole();
  return (
    <button
      type="button"
      className="hud-btn"
      onClick={() => {
        primeAudio();
        armAlerts(!alertsArmed);
      }}
      style={
        alertsArmed
          ? { borderColor: "var(--danger)", color: "var(--danger)", boxShadow: "0 0 16px var(--danger)" }
          : undefined
      }
      title="Arm/disarm the SMS siren"
    >
      {alertsArmed ? (compact ? "ARMED" : "ALERTS ARMED") : compact ? "ARM" : "ENABLE ALERTS"}
    </button>
  );
}
