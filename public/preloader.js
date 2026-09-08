/* NIRAKSHAN — opening animation (vanilla JS, zero dependencies) */
(function () {
  "use strict";
  if (window.__NIRAKSHAN_PL__) return;
  window.__NIRAKSHAN_PL__ = true;

  var LOGO_SRC = "sih.png";
  var TARGET_ID = "brand-logo";
  var SKIP_ON_REVISIT = true;

  var PHASES = ["boot", "glitch", "logo", "look", "reveal", "settle"];
  var CAPTIONS = { boot:"ESTABLISHING UPLINK", glitch:"DECRYPTING VISION",
    logo:"VISION ONLINE", look:"SCANNING PERIMETER", reveal:"", settle:"" };
  var BOOT_LINES = [
    "NIRAKSHAN // SECURE BOOT v2.0",
    "initializing vision core ......... OK",
    "mounting /dev/retina ............. OK",
    "decrypting iris.key .............. OK",
    "calibrating optic nerve .......... OK",
    "> ACCESS GRANTED"
  ];
  var DUR = { boot:2200, glitch:800, logo:1300, look:1900, reveal:1000, settle:850 };

  var reduced = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reduced) DUR = { boot:150, glitch:0, logo:200, look:0, reveal:450, settle:450 };

  function seen() { try { return sessionStorage.getItem("nirakshan-booted") === "1"; } catch (e) { return false; } }
  function mark() { try { sessionStorage.setItem("nirakshan-booted", "1"); } catch (e) {} }

  var instant = reduced || (SKIP_ON_REVISIT && seen());
  var gateStyle = null, overlay = null, els = {};
  var phase = "", phaseTimer = 0, bootTimer = 0, rafId = 0;

  function cleanup() { document.documentElement.classList.remove("pl-active", "pl-lock"); }
  function finish() {
    mark(); cleanup();
    if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    window.removeEventListener("resize", onResize);
    if (overlay) { overlay.remove(); overlay = null; }
    if (gateStyle) { gateStyle.remove(); gateStyle = null; }
  }

  if (instant) {
    mark();
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", cleanup);
    return;
  }

  gateStyle = document.createElement("style");
  gateStyle.textContent =
    "html.pl-active body>*:not(.pl-overlay){visibility:hidden!important}" +
    "html.pl-lock,html.pl-lock body{overflow:hidden!important}" +
    "html.pl-lock #brand-logo{opacity:0!important}";
  document.head.appendChild(gateStyle);
  document.documentElement.classList.add("pl-active", "pl-lock");

  function q(s) { return overlay.querySelector(s); }
  function build() {
    overlay = document.createElement("div");
    overlay.className = "pl-overlay";
    overlay.innerHTML =
      '<div class="pl-bg">' +
        '<canvas class="pl-matrix"></canvas>' +
        '<div class="pl-scanlines"></div>' +
        '<div class="pl-vignette"></div>' +
        '<pre class="pl-boot"></pre>' +
        '<div class="pl-glitchbars" style="display:none"></div>' +
      '</div>' +
      '<div class="pl-stage">' +
        '<div class="pl-flyer">' +
          '<div class="pl-logo">' +
            '<div class="pl-logo__face"></div>' +
            '<div class="pl-logo__face pl-logo__face--r"></div>' +
            '<div class="pl-logo__face pl-logo__face--c"></div>' +
            '<div class="pl-logo__iris"></div>' +
          '</div>' +
        '</div>' +
        '<div class="pl-caption"></div>' +
      '</div>' +
      '<button class="pl-skip" type="button">SKIP \u25B8</button>';
    document.body.appendChild(overlay);

    els.bg = q(".pl-bg"); els.boot = q(".pl-boot"); els.bars = q(".pl-glitchbars");
    els.flyer = q(".pl-flyer"); els.logo = q(".pl-logo");
    els.caption = q(".pl-caption"); els.skip = q(".pl-skip");
    els.canvas = q(".pl-matrix");

    els.logo.style.setProperty("--pl-logo", 'url("' + LOGO_SRC + '")');
    els.skip.addEventListener("click", skip);
    startMatrix();
  }

  function next(i) {
    if (i >= PHASES.length) { finish(); return; }
    phase = PHASES[i];
    applyPhase(phase);
    if (phase !== "settle")
      phaseTimer = setTimeout(function () { next(i + 1); }, DUR[phase]);
  }
  function applyPhase(p) {
    if (p === "boot") {
      els.caption.textContent = CAPTIONS.boot;
      els.canvas.classList.remove("pl-matrix--dim");
      typeBoot();
    } else if (p === "glitch") {
      els.caption.textContent = CAPTIONS.glitch;
      els.bars.style.display = "block";
      els.boot.classList.add("pl-boot--scramble");
    } else if (p === "logo") {
      clearTimeout(bootTimer);
      if (els.boot.isConnected) els.boot.remove();
      els.bars.style.display = "none";
      els.canvas.classList.add("pl-matrix--dim");
      els.caption.textContent = CAPTIONS.logo;
      els.logo.classList.add("pl-logo--in");
    } else if (p === "look") {
      els.caption.textContent = CAPTIONS.look;
      els.logo.classList.remove("pl-logo--in");
      els.logo.classList.add("pl-logo--steady", "pl-logo--look");
    } else if (p === "reveal") {
      els.caption.textContent = "";
      els.skip.style.display = "none";
      document.documentElement.classList.remove("pl-active");
      if (els.boot.isConnected) els.boot.remove();
      els.bars.style.display = "none";
      els.canvas.classList.add("pl-matrix--dim");
      els.bg.classList.add("pl-bg--open");
      els.logo.classList.remove("pl-logo--look");
      els.logo.classList.add("pl-logo--steady");
    } else if (p === "settle") {
      if (els.bg.isConnected) els.bg.remove();
      flyHome();
    }
  }
  function skip() {
    if (phase === "reveal" || phase === "settle") return;
    clearTimeout(phaseTimer);
    applyPhase("reveal");
    phaseTimer = setTimeout(function () { next(PHASES.length - 1); }, 900);
  }

  function flyHome() {
    var target = document.getElementById(TARGET_ID);
    var s = els.flyer.getBoundingClientRect();
    var dx, dy, scale, hasTarget = false;

    if (target && target.getBoundingClientRect().width > 0) {
      var t = target.getBoundingClientRect();
      hasTarget = true;
      dx = t.left + t.width / 2 - (s.left + s.width / 2);
      dy = t.top + t.height / 2 - (s.top + s.height / 2);
      scale = t.width / s.width;
    } else {
      scale = 40 / s.width;
      dx = (24 + (s.width * scale) / 2) - (s.left + s.width / 2);
      dy = (24 + (s.height * scale) / 2) - (s.top + s.height / 2);
    }

    els.flyer.classList.add("pl-flyer--go");
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      els.flyer.style.transform =
        "translate(" + dx + "px," + dy + "px) scale(" + scale + ")";
    }); });

    setTimeout(function () {
      if (!overlay) return;
      if (hasTarget) { target.classList.add("logo-landed"); finish(); }
      else { els.flyer.style.opacity = "0"; setTimeout(finish, 430); }
    }, 900);
  }

  var mtx = { ctx: null, cols: 0, drops: [], fontSize: 15, last: 0 };
  function onResize() {
    els.canvas.width = window.innerWidth;
    els.canvas.height = window.innerHeight;
    mtx.cols = Math.ceil(els.canvas.width / mtx.fontSize);
    mtx.drops = [];
    for (var i = 0; i < mtx.cols; i++) mtx.drops.push(Math.floor(Math.random() * -80));
  }
  function startMatrix() {
    mtx.ctx = els.canvas.getContext("2d");
    onResize();
    window.addEventListener("resize", onResize);
    rafId = requestAnimationFrame(mdraw);
  }
  function mdraw(t) {
    if (!overlay) return;
    rafId = requestAnimationFrame(mdraw);
    if (t - mtx.last < 55) return;
    mtx.last = t;
    var ctx = mtx.ctx;
    ctx.fillStyle = "rgba(1,5,7,0.16)";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.font = "bold 15px monospace";
    for (var i = 0; i < mtx.cols; i++) {
      ctx.fillStyle = Math.random() > 0.975 ? "#d8ffff" : "rgba(60,214,232,0.85)";
      ctx.fillText(Math.random() > 0.5 ? "1" : "0", i * mtx.fontSize, mtx.drops[i] * mtx.fontSize);
      if (mtx.drops[i] * mtx.fontSize > els.canvas.height && Math.random() > 0.976) mtx.drops[i] = 0;
      mtx.drops[i]++;
    }
  }

  function typeBoot() {
    clearTimeout(bootTimer);
    var line = 0, ch = 0, done = [];
    els.boot.classList.remove("pl-boot--scramble");
    (function tick() {
      if (!els.boot.isConnected) return;
      if (line >= BOOT_LINES.length) return;
      ch++;
      els.boot.innerHTML = done.concat(BOOT_LINES[line].slice(0, ch)).join("\n") +
        '<span class="pl-cursor">\u258A</span>';
      var d;
      if (ch >= BOOT_LINES[line].length) { done.push(BOOT_LINES[line]); line++; ch = 0; d = 120; }
      else d = 2 + Math.random() * 8;
      bootTimer = setTimeout(tick, d);
    })();
  }

  function start() { build(); next(0); }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
