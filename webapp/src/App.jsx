import { useState, useEffect } from "react";
import DesktopShell from "./shells/desktopshell.jsx";
import MobileShell from "./shells/mobileshell.jsx";
import Preloader from "./components/preloader.jsx";
import BriefingModal from "./components/briefingmodal.jsx";

export default function App() {
  const [desktop, setDesktop] = useState(window.innerWidth >= 1024);
  const [briefing, setBriefing] = useState(false);

  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const Shell = desktop ? DesktopShell : MobileShell;

  return (
    <>
      <Preloader />
      <Shell />
      {briefing && <BriefingModal onClose={() => setBriefing(false)} />}
    </>
  );
}
