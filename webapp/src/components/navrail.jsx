import { VIEWS } from "../nav";

export default function NavRail({ active, onSelect }) {
  return (
    <nav
      className="flex flex-col gap-1 p-2 overflow-y-auto border-r"
      style={{ background: "var(--bg-z1)", borderColor: "var(--border)", width: 232 }}
      aria-label="Primary"
    >
      {VIEWS.map((v) => {
        const isActive = v.id === active;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-current={isActive ? "page" : undefined}
            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all"
            style={{
              background: isActive ? "color-mix(in srgb, var(--accent-cyan) 14%, transparent)" : "transparent",
              borderLeft: `3px solid ${isActive ? "var(--accent-cyan)" : "transparent"}`,
              boxShadow: isActive ? "0 0 18px var(--glow)" : "none",
            }}
          >
            <span
              className="text-base w-5 text-center"
              style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-muted)" }}
            >
              {v.icon}
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className="hud-label"
                style={{ letterSpacing: "0.16em", color: isActive ? "var(--text-main)" : "var(--text-muted)" }}
              >
                {v.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{v.desc}</span>
            </span>
          </button>
        );
      })}
      <div className="mt-auto px-3 py-2 hud-label" style={{ fontSize: 12, color: "var(--text-dim)" }}>
        SIH 2026 · PS 26184
      </div>
    </nav>
  );
}
