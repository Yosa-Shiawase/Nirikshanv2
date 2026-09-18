// FIX 3 evidence: RGB translucent panels, contrast at both cycle extremes.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const lumHex = (hex) => {
  const n = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const ratio = (a, b) => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = { probe: [], errors: [] };

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") out.errors.push("console: " + m.text()); });
page.on("pageerror", (e) => out.errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
await page.waitForTimeout(400);
await page.locator("button", { hasText: "RGB Pulse" }).first().click();
await page.waitForTimeout(600);
out.theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

// a surface painted with the live RGB panel background, swept over the gradient
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const panel = getComputedStyle(document.querySelector(".hud-panel"));
  return {
    panelBg: panel.backgroundColor,
    main: cs.getPropertyValue("--text-main").trim(),
    muted: cs.getPropertyValue("--text-muted").trim(),
    dim: cs.getPropertyValue("--text-dim").trim(),
  };
});
out.tokens = tokens;
await page.evaluate((bg) => {
  const d = document.createElement("div");
  d.id = "rgb-probe";
  d.style.cssText = `position:fixed;width:120px;height:120px;z-index:0;background:${bg};pointer-events:none`;
  document.body.appendChild(d);
}, tokens.panelBg);

const readProbe = async () => {
  const buf = await page.screenshot({ clip: { x: pos[0], y: pos[1], width: 120, height: 120 } });
  return page.evaluate(async (payload) => {
    const img = new Image();
    img.src = "data:image/png;base64," + payload;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      if (L > max) max = L;
    }
    return max;
  }, buf.toString("base64"));
};

const positions = [[20, 20], [1300, 20], [20, 760], [1300, 760], [660, 400]];
let pos = positions[0];
for (const phase of [0, 25, 50, 75]) {
  await page.addStyleTag({ content: `html[data-theme="rgb"]::before{animation:none !important;background-position:${phase}% 50% !important}` });
  let worst = 0;
  let darkest = 1;
  for (const p of positions) {
    pos = p;
    await page.evaluate((q) => {
      const d = document.getElementById("rgb-probe");
      d.style.left = q[0] + "px";
      d.style.top = q[1] + "px";
    }, p);
    await page.waitForTimeout(120);
    const L = await readProbe();
    if (L > worst) worst = L;
    if (L < darkest) darkest = L;
  }
  out.probe.push({
    phase,
    backdropMaxLum: Number(worst.toFixed(4)),
    backdropMinLum: Number(darkest.toFixed(4)),
    contrastWhite: ratio(lumHex(tokens.main), worst),
    contrastMuted: ratio(lumHex(tokens.muted), worst),
    contrastDim: ratio(lumHex(tokens.dim), worst),
    contrastWhiteDarkest: ratio(lumHex(tokens.main), darkest),
  });
}
out.worst = out.probe.slice().sort((a, b) => a.contrastWhite - b.contrastWhite)[0];

out.panel = await page.evaluate(() => {
  const panel = document.querySelector(".hud-panel");
  const cs = getComputedStyle(panel);
  return { bg: cs.backgroundColor, color: cs.color, borderColor: cs.borderColor };
});
await ctx.close();

/* ---------- screenshots with text, at the brightest phase ---------- */
const brightest = out.probe.slice().sort((a, b) => b.backdropMaxLum - a.backdropMaxLum)[0];
const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const sp = await sctx.newPage();
await sp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await sp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await sp.waitForTimeout(1200);
await sp.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
await sp.waitForTimeout(400);
await sp.locator("button", { hasText: "RGB Pulse" }).first().click();
await sp.waitForTimeout(400);
await sp.addStyleTag({ content: `html[data-theme="rgb"]::before{animation:none !important;background-position:${brightest.phase}% 50% !important}` });
for (const [pane, label] of [["MAP", "map"], ["ALERTS", "alerts"], ["DASHBOARD", "dashboard"]]) {
  await sp.locator('nav[aria-label="Primary"] button', { hasText: pane }).first().click();
  await sp.waitForTimeout(pane === "MAP" ? 2600 : 900);
  await sp.screenshot({ path: `shots/fix3-rgb-${label}-1440.png` });
}
out.brightestPhase = brightest.phase;
await sctx.close();

/* ---------- reduced motion ---------- */
const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const rp = await rctx.newPage();
await rp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await rp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await rp.waitForTimeout(1000);
await rp.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
await rp.waitForTimeout(400);
await rp.locator("button", { hasText: "RGB Pulse" }).first().click();
await rp.waitForTimeout(500);
out.reducedMotion = await rp.evaluate(() => {
  const before = getComputedStyle(document.documentElement, "::before");
  const panel = document.querySelector(".hud-panel");
  return {
    gradientAnimation: before.animationName,
    backgroundPosition: before.backgroundPosition,
    panelAnimation: getComputedStyle(panel).animationName,
    panelBg: getComputedStyle(panel).backgroundColor,
  };
});
await rp.screenshot({ path: "shots/fix3-rgb-reduced.png" });
await rctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
