import ContextPanel from "./ContextPanel";

export default function ContextDrawer() {
  return (
    <aside
      className="flex flex-col overflow-y-auto border-l"
      style={{ background: "var(--bg-z1)", borderColor: "var(--border)", width: 336, padding: 12 }}
      aria-label="Context"
    >
      <ContextPanel />
    </aside>
  );
}
