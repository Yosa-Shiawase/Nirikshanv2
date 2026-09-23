import { useCallback, useMemo, useState } from "react";
import Preloader from "./components/preloader.jsx";
import BriefingModal from "./components/briefingmodal.jsx";
import AlertBanner from "./components/alertbanner.jsx";
import DesktopShell from "./shells/desktopshell.jsx";
import MobileShell from "./shells/mobileshell.jsx";
import { useMediaQuery, DESKTOP_QUERY } from "./hooks/usemediaquery.js";
import { DEFAULT_VIEW } from "./nav.js";

export default function App() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [bootedAt, setBootedAt] = useState(0);

  const logoUrl = useMemo(() => `${import.meta.env.BASE_URL || "/"}sih.png`, []);

  const onPreloaderDone = useCallback(() => setBootedAt(Date.now()), []);
  const openBriefing = useCallback(() => setBriefingOpen(true), []);
  const closeBriefing = useCallback(() => setBriefingOpen(false), []);
  const openSystem = useCallback(() => setView("system"), []);

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
          />
        ) : (
          <MobileShell view={view} setView={setView} onOpenBriefing={openBriefing} />
        )}
      </div>

      <AlertBanner />
      <BriefingModal open={briefingOpen} onClose={closeBriefing} />

      {/* dev-only mount marker used by the smoke test (see README) */}
      <span data-nir-boot={bootedAt ? "done" : "pending"} style={{ display: "none" }} />
    </>
  );
}
