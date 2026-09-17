import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { DEFAULT_HAWKES } from "../lib/hawkes";

// Cross-pane console state: which node is focused, the live Hawkes tunables,
// the BNSS strict switch, the watchlist, alert arming, and the case trace.
const ConsoleContext = createContext(null);

const TRACE_REFRESH_MS = 15000;

export function ConsoleProvider({ children }) {
  const [selectedNode, setSelectedNode] = useState("DL-01");
  const [hawkes, setHawkesState] = useState(() => ({ ...DEFAULT_HAWKES }));
  const [horizonHours, setHorizonHours] = useState(0);
  const [bnssStrict, setBnssStrict] = useState(false);
  const [alertsArmed, setAlertsArmed] = useState(false);
  const [watchlist, setWatchlist] = useState([]);

  const [caseTrace, setCaseTrace] = useState({ data: null, loading: false, error: "", lastAt: 0 });
  const traceTimer = useRef(null);

  const setHawkes = useCallback((patch) => {
    setHawkesState((h) => ({ ...h, ...patch }));
  }, []);

  const armAlerts = useCallback((on) => setAlertsArmed(!!on), []);

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
