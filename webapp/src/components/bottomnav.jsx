import { MOBILE_PRIMARY, viewById } from "../nav";

// Mobile bottom bar: MAP / ALERTS / QR / MORE. 44px+ targets, safe-area aware.
export default function BottomNav({ active, onSelect, onMore, moreActive }) {
  const tabs = MOBILE_PRIMARY.map((id) => viewById(id));

  return (
    <nav
      className="grid grid-cols-4 border-t"
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
