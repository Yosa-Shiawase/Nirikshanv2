import TopBar from "../components/TopBar";
import NavRail from "../components/NavRail";
import ContextDrawer from "../components/ContextDrawer";
import { ViewPane } from "../views";

// Desktop ≥1024px: full-bleed 3-zone console, edge to edge, projector-readable.
export default function DesktopShell({ view, setView, onOpenBriefing, onOpenSystem, alertsArmed, onToggleAlerts }) {
  return (
    <div className="flex flex-col" style={{ height: "100dvh", minHeight: 0 }}>
      <TopBar
        onOpenBriefing={onOpenBriefing}
        onOpenSystem={onOpenSystem}
        alertsArmed={alertsArmed}
        onToggleAlerts={onToggleAlerts}
      />
      <div className="flex flex-1 min-h-0">
        <NavRail active={view} onSelect={setView} />
        <main className="flex-1 min-w-0 overflow-y-auto p-4" style={{ background: "var(--bg-core)" }}>
          <ViewPane id={view} />
        </main>
        <ContextDrawer />
      </div>
    </div>
  );
}
