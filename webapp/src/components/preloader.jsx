import { useEffect, useMemo, useRef, useState } from "react";
import "./preloader.css";

// Cinematic NIRAKSHAN boot — ported from public/preloader.js.
// Phases: boot -> glitch -> logo -> look -> reveal -> settle (fly home to #brand-logo).
// Plays once per session; honours prefers-reduced-motion; always skippable.

const LOGO_AR = "843 / 1263";
const PHASES = ["boot", "glitch", "logo", "look", "reveal", "settle"];
const CAPTIONS = {
  boot: "ESTABLISHING UPLINK",
  glitch: "DECRYPTING VISION",
  logo: "VISION ONLINE",
  look: "SCANNING PERIMETER",
  reveal: "",
  settle: "",
};
const BOOT_LINES = [
  "NIRAKSHAN // SECURE BOOT v2.0",
  "initializing vision core ......... OK",
  "mounting /dev/retina ............. OK",
  "decrypting iris.key .............. OK",
  "calibrating optic nerve .......... OK",
  "> ACCESS GRANTED",
];
const DUR = { boot: 2200, glitch: 800, logo: 1300, look: 1900, reveal: 1000, settle: 850 };
const DUR_REDUCED = { boot: 150, glitch: 0, logo: 200, look: 0, reveal: 450, settle: 450 };

function markBooted() {
  try {
    sessionStorage.setItem("nir-booted", "1");
  } catch (e) {
    /* ignore */
  }
}
function alreadyBooted() {
  try {
    return sessionStorage.getItem("nir-booted") === "1";
  } catch (e) {
    return false;
  }
}

export default function Preloader({ logoUrl, targetId = "brand-logo", onDone }) {
  const { skipInstant, dur } = useMemo(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      skipInstant: reduced || alreadyBooted(),
      dur: reduced ? DUR_REDUCED : DUR,
    };
  }, []);

  const [mounted, setMounted] = useState(!skipInstant);

  const overlayRef = useRef(null);
  const bgRef = useRef(null);
  const canvasRef = useRef(null);
  const bootRef = useRef(null);
  const barsRef = useRef(null);
  const captionRef = useRef(null);
  const flyerRef = useRef(null);
  const logoRef = useRef(null);
  const skipRef = useRef(null);

  const phaseRef = useRef("");
  const timers = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!mounted) {
      markBooted();
      if (onDone) onDone();
      return undefined;
    }

    document.documentElement.classList.add("pl-active", "pl-lock");
    const t = timers.current;
    const raf = rafRef;

    // ---- matrix rain ----
    const mtx = { ctx: null, cols: 0, drops: [], fontSize: 15, last: 0 };
    const canvas = canvasRef.current;
    const dimMatrix = () => canvas && canvas.classList.add("pl-matrix--dim");

    const onResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      mtx.cols = Math.ceil(canvas.width / mtx.fontSize);
      mtx.drops = [];
      for (let i = 0; i < mtx.cols; i++) mtx.drops.push(Math.floor(Math.random() * -80));
    };
    const mdraw = (now) => {
      if (!overlayRef.current) return;
      raf.current = requestAnimationFrame(mdraw);
      if (now - mtx.last < 55) return;
      mtx.last = now;
      const ctx = mtx.ctx;
      if (!ctx) return;
      ctx.fillStyle = "rgba(1,5,7,0.16)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 15px monospace";
      for (let i = 0; i < mtx.cols; i++) {
        ctx.fillStyle = Math.random() > 0.975 ? "#d8ffff" : "rgba(60,214,232,0.85)";
        ctx.fillText(Math.random() > 0.5 ? "1" : "0", i * mtx.fontSize, mtx.drops[i] * mtx.fontSize);
        if (mtx.drops[i] * mtx.fontSize > canvas.height && Math.random() > 0.976) mtx.drops[i] = 0;
        mtx.drops[i]++;
      }
    };
    if (canvas) {
      mtx.ctx = canvas.getContext("2d");
      onResize();
      window.addEventListener("resize", onResize);
      raf.current = requestAnimationFrame(mdraw);
    }

    // ---- boot typewriter ----
    let bootTimer = null;
    const typeBoot = () => {
      const el = bootRef.current;
      if (!el) return;
      el.classList.remove("pl-boot--scramble");
      let line = 0;
      let ch = 0;
      const done = [];
      const tick = () => {
        const node = bootRef.current;
        if (!node || !node.isConnected) return;
        if (line >= BOOT_LINES.length) return;
        ch++;
        node.innerHTML =
          done.concat(BOOT_LINES[line].slice(0, ch)).join("\n") + '<span class="pl-cursor">▊</span>';
        let d;
        if (ch >= BOOT_LINES[line].length) {
          done.push(BOOT_LINES[line]);
          line++;
          ch = 0;
          d = 120;
        } else {
          d = 2 + Math.random() * 8;
        }
        bootTimer = setTimeout(tick, d);
      };
      tick();
    };

    const finish = () => {
      markBooted();
      document.documentElement.classList.remove("pl-active", "pl-lock");
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      window.removeEventListener("resize", onResize);
      setMounted(false);
      if (onDone) onDone();
    };

    const flyHome = () => {
      const target = typeof document !== "undefined" ? document.getElementById(targetId) : null;
      const flyer = flyerRef.current;
      if (!flyer) {
        finish();
        return;
      }
      const s = flyer.getBoundingClientRect();
      let dx, dy, scale, hasTarget = false;
      if (target && target.getBoundingClientRect().width > 0) {
        const rect = target.getBoundingClientRect();
        hasTarget = true;
        dx = rect.left + rect.width / 2 - (s.left + s.width / 2);
        dy = rect.top + rect.height / 2 - (s.top + s.height / 2);
        scale = rect.width / s.width;
      } else {
        scale = 40 / s.width;
        dx = 24 + (s.width * scale) / 2 - (s.left + s.width / 2);
        dy = 24 + (s.height * scale) / 2 - (s.top + s.height / 2);
      }
      flyer.classList.add("pl-flyer--go");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          flyer.style.transform = `translate(${dx}px,${dy}px) scale(${scale})`;
        })
      );
      timers.current.push(
        setTimeout(() => {
          if (hasTarget) {
            target.classList.add("logo-landed");
            finish();
          } else {
            flyer.style.opacity = "0";
            timers.current.push(setTimeout(finish, 430));
          }
        }, 900)
      );
    };

    const applyPhase = (p) => {
      const caption = captionRef.current;
      const logo = logoRef.current;
      const bars = barsRef.current;
      if (p === "boot") {
        if (caption) caption.textContent = CAPTIONS.boot;
        canvas && canvas.classList.remove("pl-matrix--dim");
        typeBoot();
      } else if (p === "glitch") {
        if (caption) caption.textContent = CAPTIONS.glitch;
        if (bars) bars.style.display = "block";
        bootRef.current && bootRef.current.classList.add("pl-boot--scramble");
      } else if (p === "logo") {
        clearTimeout(bootTimer);
        if (bootRef.current && bootRef.current.isConnected) bootRef.current.remove();
        if (bars) bars.style.display = "none";
        dimMatrix();
        if (caption) caption.textContent = CAPTIONS.logo;
        logo && logo.classList.add("pl-logo--in");
      } else if (p === "look") {
        if (caption) caption.textContent = CAPTIONS.look;
        if (logo) {
          logo.classList.remove("pl-logo--in");
          logo.classList.add("pl-logo--steady", "pl-logo--look");
        }
      } else if (p === "reveal") {
        if (caption) caption.textContent = "";
        if (skipRef.current) skipRef.current.style.display = "none";
        document.documentElement.classList.remove("pl-active");
        if (bootRef.current && bootRef.current.isConnected) bootRef.current.remove();
        if (bars) bars.style.display = "none";
        dimMatrix();
        bgRef.current && bgRef.current.classList.add("pl-bg--open");
        if (logo) {
          logo.classList.remove("pl-logo--look");
          logo.classList.add("pl-logo--steady");
        }
      } else if (p === "settle") {
        if (bgRef.current && bgRef.current.isConnected) bgRef.current.remove();
        flyHome();
      }
    };

    const next = (i) => {
      if (i >= PHASES.length) {
        finish();
        return;
      }
      const p = PHASES[i];
      phaseRef.current = p;
      applyPhase(p);
      if (p !== "settle") {
        timers.current.push(setTimeout(() => next(i + 1), dur[p]));
      }
    };

    const skip = () => {
      if (phaseRef.current === "reveal" || phaseRef.current === "settle") return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      applyPhase("reveal");
      timers.current.push(setTimeout(() => next(PHASES.length - 1), 900));
    };
    if (skipRef.current) skipRef.current.addEventListener("click", skip);

    next(0);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      clearTimeout(bootTimer);
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", onResize);
      if (skipRef.current) skipRef.current.removeEventListener("click", skip);
      document.documentElement.classList.remove("pl-active", "pl-lock");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="pl-overlay" ref={overlayRef}>
      <div className="pl-bg" ref={bgRef}>
        <canvas className="pl-matrix" ref={canvasRef} />
        <div className="pl-scanlines" />
        <div className="pl-vignette" />
        <pre className="pl-boot" ref={bootRef} />
        <div className="pl-glitchbars" ref={barsRef} style={{ display: "none" }} />
      </div>
      <div className="pl-stage">
        <div className="pl-flyer" ref={flyerRef}>
          <div
            className="pl-logo"
            ref={logoRef}
            style={{ "--pl-logo": `url("${logoUrl}")`, "--pl-logo-ar": LOGO_AR }}
          >
            <div className="pl-logo__face" />
            <div className="pl-logo__face pl-logo__face--r" />
            <div className="pl-logo__face pl-logo__face--c" />
            <div className="pl-logo__iris" />
          </div>
        </div>
        <div className="pl-caption" ref={captionRef} />
      </div>
      <button className="pl-skip" type="button" ref={skipRef}>
        SKIP ▸
      </button>
    </div>
  );
}
