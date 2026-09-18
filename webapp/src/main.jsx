import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { ConsoleProvider } from "./context/ConsoleContext";
import { LiveFeedProvider } from "./live/useLiveFeed";

// NOTE: no <StrictMode> on purpose — the preloader is a one-shot timeline and
// StrictMode's double-invoked effects would restart it. Providers wrap App so
// every pane can read theme + live feed + console state.
createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <ConsoleProvider>
      <LiveFeedProvider>
        <App />
      </LiveFeedProvider>
    </ConsoleProvider>
  </ThemeProvider>
);

// Offline fallback: register the (deliberately tiny) service worker in
// production only. It caches just /404.html and only answers failed
// navigations, so it can never serve a stale console.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort */
    });
  });
}
