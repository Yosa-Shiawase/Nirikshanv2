import { useCallback, useMemo, useState } from "react";
import Preloader from "./components/Preloader";
import BriefingModal from "./components/BriefingModal";
import DesktopShell from "./shells/DesktopShell";
import MobileShell from "./shells/MobileShell";
import { useMediaQuery, DESKTOP_QUERY } from "./hooks/useMediaQuery";
import { DEFAULT_VIEW } from "./nav";

export default function App() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [alertsArmed, setAlertsArmed] = useState(false);
  const [bootedAt, setBootedAt] = useState(0);

  const logoUrl = useMemo(() => `${import.meta.env.BASE_URL || "/"}sih.png`, []);

  const onPreloaderDone = useCallback(() => setBootedAt(Date.now()), []);
  const openBriefing = useCallback(() => setBriefingOpen(true), []);
  const closeBriefing = useCallback(() => setBriefingOpen(false), []);
  const openSystem = useCallback(() => setView("system"), []);
  const toggleAlerts = useCallback(() => setAlertsArmed((a) => !a), []);

  return (
    <>
      <Preloader logoUrl={logoUrl} targetId="brand-logo" onDone={onPreloaderDone} />

      <div id="app-shell" style={{ height: "100dvh" }}>
        {isDesktop ? (
          <DesktopShell
            view={view}
            setView={setView}
            onOpenBriefing={openBriefing}
            onOpenSystem={openSystem}
            alertsArmed={alertsArmed}
            onToggleAlerts={toggleAlerts}
          />
        ) : (
          <MobileShell
            view={view}
            setView={setView}
            onOpenBriefing={openBriefing}
            alertsArmed={alertsArmed}
            onToggleAlerts={toggleAlerts}
          />
        )}
      </div>

      <BriefingModal open={briefingOpen} onClose={closeBriefing} />

      {/* dev-only mount marker used by the smoke test (see README) */}
      <span data-nir-boot={bootedAt ? "done" : "pending"} style={{ display: "none" }} />
    </>
  );
}
