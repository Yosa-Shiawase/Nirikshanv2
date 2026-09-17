import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { LiveFeedProvider } from "./live/useLiveFeed";

// NOTE: no <StrictMode> on purpose — the preloader is a one-shot timeline and
// StrictMode's double-invoked effects would restart it. Providers wrap App so
// every pane can read theme + live feed.
createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <LiveFeedProvider>
      <App />
    </LiveFeedProvider>
  </ThemeProvider>
);
