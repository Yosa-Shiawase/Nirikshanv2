import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api.js";
import { DEFAULT_HAWKES } from "../lib/hawkes.js";

// Cross-pane console state: which node is focused, the live Hawkes tunables,
// the BNSS strict switch, the watchlist, alert arming, and the case trace.
const ConsoleContext = createContext(null);

const TRACE_REFRESH_MS = 15000;
// session-surviving arming of the SMS siren
const ALERTS_STORE = ["nir", "alerts", "armed"].join("-");

export function ConsoleProvider({ children }) {
  const [selectedNode, setSelectedNode] = useState("DL-01");
  const [hawkes, setHawkesState] = useState(() => ({ ...DEFAULT_HAWKES }));
  const [horizonHours, setHorizonHours] = useState(0);
  const [bnssStrict, setBnssStrict] = useState(false);
  const [alertsArmed, setAlertsArmed] = useState(() => {
    try {
      return localStorage.getItem(ALERTS_STORE) === "1";
    } catch (err) {
      return false;
    }
  });
  const [watchlist, setWatchlist] = useState([]);

  const [caseTrace, setCaseTrace] = useState({ data: null, loading: false, error: "", lastAt: 0 });
  const traceTimer = useRef(null);

  const setHawkes = useCallback((patch) => {
    setHawkesState((h) => ({ ...h, ...patch }));
  }, []);

  const armAlerts = useCallback((on) => {
    setAlertsArmed(!!on);
    try {
      localStorage.setItem(ALERTS_STORE, on ? "1" : "0");
    } catch (err) {
      /* storage blocked */
    }
  }, []);

  /** Restore the prediction engine + lien policy to operational defaults. */
  const resetDefaults = useCallback(() => {
    setHawkesState({ ...DEFAULT_HAWKES });
    setBnssStrict(true);
    setHorizonHours(0);
  }, []);

  const toggleWatch = useCallback((vpa) => {
    if (!vpa) return;
    setWatchlist((list) => (list.includes(vpa) ? list.filter((v) => v !== vpa) : [...list, vpa]));
  }, []);

  const isWatched = useCallback((vpa) => watchlist.includes(vpa), [watchlist]);

  const refreshCaseTrace = useCallback(async () => {
    setCaseTrace((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await api.caseTrace();
      setCaseTrace({ data, loading: false, error: "", lastAt: Date.now() });
    } catch (err) {
      setCaseTrace((s) => ({ ...s, loading: false, error: String(err.message || err) }));
    }
  }, []);

  useEffect(() => {
    refreshCaseTrace();
    traceTimer.current = setInterval(refreshCaseTrace, TRACE_REFRESH_MS);
    return () => clearInterval(traceTimer.current);
  }, [refreshCaseTrace]);

  const value = useMemo(
    () => ({
      selectedNode,
      setSelectedNode,
      hawkes,
      setHawkes,
      horizonHours,
      setHorizonHours,
      bnssStrict,
      setBnssStrict,
      alertsArmed,
      setAlertsArmed,
      armAlerts,
      resetDefaults,
      watchlist,
      toggleWatch,
      isWatched,
      caseTrace,
      refreshCaseTrace,
    }),
    [
      selectedNode,
      hawkes,
      setHawkes,
      horizonHours,
      bnssStrict,
      alertsArmed,
      armAlerts,
      resetDefaults,
      watchlist,
      toggleWatch,
      isWatched,
      caseTrace,
      refreshCaseTrace,
    ]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return ctx;
}

export default ConsoleContext;
