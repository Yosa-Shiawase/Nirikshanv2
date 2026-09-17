import { useState } from "react";
import BottomNav from "../components/BottomNav";
import Sheet from "../components/Sheet";
import { Clock, LiveDot } from "../components/TopBar";
import { AlertsToggle } from "../components/AlertBanner";
import ContextPanel from "../components/ContextPanel";
import { ViewPane } from "../views";
import { MOBILE_PRIMARY, VIEWS } from "../nav";
import { useTheme } from "../context/ThemeContext";
import { useConsole } from "../context/ConsoleContext";

// Mobile <1024px: genuine app-style layout — full-screen view, bottom nav,
// swipeable sheets, stacked cards, no hover-dependent info, 44px+ targets.
export default function MobileShell({ view, setView, onOpenBriefing }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const { cycleTheme } = useTheme();
  const { selectedNode } = useConsole();
  const moreActive = !MOBILE_PRIMARY.includes(view);

  const morePanes = VIEWS.filter((v) => !MOBILE_PRIMARY.includes(v.id));

  return (
    <div className="flex flex-col" style={{ height: "100dvh", minHeight: 0 }}>
      <header
        className="flex items-center gap-2 px-3 border-b"
        style={{
          background: "var(--bg-z1)",
          borderColor: "var(--border)",
          paddingTop: "env(safe-area-inset-top)",
          minHeight: 52,
        }}
      >
        <img
          id="brand-logo"
          alt="NIRAKSHAN"
          src={`${import.meta.env.BASE_URL || "/"}sih.png`}
          className="h-7 w-auto shrink-0"
        />
        <span className="m-hide text-sm font-semibold glow-text" style={{ color: "var(--accent-cyan)" }}>
          NIRAKSHAN
        </span>
        <div className="flex-1" />
        <LiveDot connected />
        <button
          type="button"
          className="hud-btn"
          onClick={() => setCtxOpen(true)}
          style={{ minHeight: 40 }}
          aria-label={`Context: ${selectedNode}`}
          title="Open node case card"
        >
          ▤ {selectedNode}
        </button>
        <button type="button" className="hud-btn" onClick={cycleTheme} style={{ minHeight: 40 }} aria-label="Cycle theme">
          ◐
        </button>
        <Clock className="hud-label tabular-nums m-hide" />
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3" style={{ background: "var(--bg-core)" }}>
        <ViewPane id={view} />
      </main>

      <BottomNav active={view} onSelect={setView} onMore={() => setMoreOpen(true)} moreActive={moreActive} />

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="MORE PANES">
        <div className="grid grid-cols-2 gap-3">
          {morePanes.map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setView(v.id);
                  setMoreOpen(false);
                }}
                className="hud-panel p-3 text-left flex items-center gap-3"
                style={{
                  minHeight: 64,
                  borderColor: isActive ? "var(--accent-cyan)" : "var(--border)",
                  boxShadow: isActive ? "0 0 16px var(--glow)" : "none",
                }}
              >
                <span style={{ color: "var(--accent-cyan)", fontSize: 18 }}>{v.icon}</span>
                <span className="flex flex-col leading-tight">
                  <span className="hud-label" style={{ letterSpacing: "0.14em" }}>{v.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{v.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="hud-btn flex-1"
            style={{ minHeight: 48 }}
            onClick={() => {
              setMoreOpen(false);
              onOpenBriefing();
            }}
          >
            AI BRIEFING
          </button>
          <span className="flex-1" style={{ display: "grid" }}>
            <AlertsToggle />
          </span>
        </div>
      </Sheet>

      <Sheet open={ctxOpen} onClose={() => setCtxOpen(false)} title="CONTEXT · NODE CASE CARD" height="78dvh">
        <ContextPanel />
      </Sheet>
    </div>
  );
}
