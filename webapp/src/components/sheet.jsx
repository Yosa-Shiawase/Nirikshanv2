import { useEffect } from "react";

// Mobile bottom sheet. Backdrop + slide-up panel; Esc closes; body scroll locked.
export default function Sheet({ open, onClose, title, children, height = "auto" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200]" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(1,5,7,0.6)", backdropFilter: "blur(2px)" }}
      />
      <div
        className="absolute left-0 right-0 bottom-0 fade-in"
        style={{
          background: "var(--bg-z1)",
          borderTop: "1px solid var(--border)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -18px 40px rgba(0,0,0,0.5)",
          maxHeight: "82dvh",
          height,
          paddingBottom: "env(safe-area-inset-bottom)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="hud-label">{title}</div>
          <button type="button" className="hud-btn" onClick={onClose} style={{ minHeight: 44 }}>
            CLOSE
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
