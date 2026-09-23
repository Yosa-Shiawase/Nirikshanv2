import { MOBILE_PRIMARY, viewById } from "../nav.js";

// Mobile bottom bar: MAP / ALERTS / QR / CASE / MORE.
// 44px+ targets, safe-area aware, active glow.
export default function BottomNav({ active, onSelect, onMore, moreActive, onCase, caseActive }) {
  const tabs = MOBILE_PRIMARY.map((id) => viewById(id));

  return (
    <nav
      className="grid grid-cols-5 border-t"
      style={{
        background: "var(--bg-z1)",
        borderColor: "var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Bottom"
    >
      {tabs.map((v) => {
        const isActive = active === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-col items-center justify-center gap-1"
            style={{
              minHeight: 60,
              paddingTop: 8,
              color: isActive ? "var(--accent-cyan)" : "var(--text-muted)",
              background: isActive ? "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" : "transparent",
              boxShadow: isActive ? "inset 0 2px 0 var(--accent-cyan), 0 0 22px var(--glow)" : "none",
            }}
          >
            <span className="text-lg leading-none">{v.icon}</span>
            <span className="hud-label" style={{ fontSize: 12, letterSpacing: "0.14em" }}>
              {v.label}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCase}
        aria-current={caseActive ? "page" : undefined}
        className="flex flex-col items-center justify-center gap-1"
        style={{
          minHeight: 60,
          paddingTop: 8,
          color: caseActive ? "var(--accent-cyan)" : "var(--text-muted)",
          background: caseActive ? "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" : "transparent",
          boxShadow: caseActive ? "inset 0 2px 0 var(--accent-cyan), 0 0 22px var(--glow)" : "none",
        }}
      >
        <span className="text-lg leading-none">▤</span>
        <span className="hud-label" style={{ fontSize: 12, letterSpacing: "0.14em" }}>
          CASE
        </span>
      </button>
      <button
        type="button"
        onClick={onMore}
        aria-current={moreActive ? "page" : undefined}
        className="flex flex-col items-center justify-center gap-1"
        style={{
          minHeight: 60,
          paddingTop: 8,
          color: moreActive ? "var(--accent-cyan)" : "var(--text-muted)",
          background: moreActive ? "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" : "transparent",
          boxShadow: moreActive ? "inset 0 2px 0 var(--accent-cyan), 0 0 22px var(--glow)" : "none",
        }}
      >
        <span className="text-lg leading-none">☰</span>
        <span className="hud-label" style={{ fontSize: 12, letterSpacing: "0.14em" }}>
          MORE
        </span>
      </button>
    </nav>
  );
}
