import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EVENTS_URL } from "../lib/api.js";

// Single EventSource for the whole app. Panes subscribe via useLiveFeed().
// app.py pushes a mix of shapes on /events:
//   - complaint objects { ack_no, timestamp, victim_vpa, target_terminal_id,
//       disputed_amount_inr, hop_count, source }
//   - { type: "anomaly", ... }
//   - { type: "sms_alert", ... }
// Everything is parsed defensively — the payloads vary.

const MAX_BUFFER = 250;

const LiveFeedContext = createContext(null);

function classify(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type === "anomaly") return "anomaly";
  if (raw.type === "sms_alert") return "sms";
  if (raw.ack_no || raw.target_terminal_id || raw.victim_vpa) return "complaint";
  return "unknown";
}

export function LiveFeedProvider({ children }) {
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [complaints, setComplaints] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [smsAlerts, setSmsAlerts] = useState([]);
  const [counters, setCounters] = useState({ total: 0, complaints: 0, anomalies: 0, sms: 0 });
  const [lastEventAt, setLastEventAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  const esRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimer = useRef(null);

  const handle = useCallback((raw) => {
    const kind = classify(raw);
    if (!kind) return;
    setLastEventAt(Date.now());
    setCounters((c) => ({
      total: c.total + 1,
      complaints: c.complaints + (kind === "complaint" ? 1 : 0),
      anomalies: c.anomalies + (kind === "anomaly" ? 1 : 0),
      sms: c.sms + (kind === "sms" ? 1 : 0),
    }));
    if (kind === "complaint") {
      setComplaints((prev) => [raw, ...prev].slice(0, MAX_BUFFER));
    } else if (kind === "anomaly") {
      setAnomalies((prev) => [raw, ...prev].slice(0, MAX_BUFFER));
    } else if (kind === "sms") {
      setSmsAlerts((prev) => [raw, ...prev].slice(0, MAX_BUFFER));
    }
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStatus((s) => (s === "live" ? s : "connecting"));

    let es;
    try {
      es = new EventSource(EVENTS_URL);
    } catch (err) {
      setStatus("error");
      setLastError(String(err));
      return;
    }
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setStatus("live");
      setLastError(null);
    };
    es.onmessage = (ev) => {
      try {
        handle(JSON.parse(ev.data));
      } catch (err) {
        // ignore malformed frame
      }
    };
    es.addEventListener("anomaly", (ev) => {
      try {
        handle({ ...JSON.parse(ev.data), type: "anomaly" });
      } catch (err) {}
    });
    es.addEventListener("sms_alert", (ev) => {
      try {
        handle({ ...JSON.parse(ev.data), type: "sms_alert" });
      } catch (err) {}
    });
    es.onerror = () => {
      setStatus("error");
      setLastError("stream disconnected");
      try {
        es.close();
      } catch (err) {}
      // exponential-ish backoff, capped at 10s
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 10000);
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [handle]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  const value = useMemo(
    () => ({
      status,
      connected: status === "live",
      complaints,
      anomalies,
      smsAlerts,
      counters,
      lastEventAt,
      lastError,
      reconnect: connect,
    }),
    [status, complaints, anomalies, smsAlerts, counters, lastEventAt, lastError, connect]
  );

  return <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>;
}

export function useLiveFeed() {
  const ctx = useContext(LiveFeedContext);
  if (!ctx) throw new Error("useLiveFeed must be used inside <LiveFeedProvider>");
  return ctx;
}

/** Latest complaint only — handy for map/dashboard headers. */
export function useLatestComplaint() {
  const { complaints } = useLiveFeed();
  return complaints[0] || null;
}

export default LiveFeedContext;
