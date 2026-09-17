/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        core: "var(--bg-core)",
        z1: "var(--bg-z1)",
        z2: "var(--bg-z2)",
        z3: "var(--bg-z3)",
        card: "var(--bg-card)",
        line: "var(--border)",
        cyan: "var(--accent-cyan)",
        blue: "var(--accent-blue)",
        main: "var(--text-main)",
        muted: "var(--text-muted)",
        dim: "var(--text-dim)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        ok: "var(--ok)",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 18px var(--glow)",
        "glow-sm": "0 0 10px var(--glow)",
      },
      screens: {
        // Single switch point mandated by the brief: desktop >= 1024px.
        desk: "1024px",
      },
    },
  },
  plugins: [],
};
