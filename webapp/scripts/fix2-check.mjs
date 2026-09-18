// FIX 2 evidence: cluster + DAG colours resolve from tokens in light theme.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const lum = (rgb) => {
  const m = String(rgb).match(/[\d.]+/g) || [0, 0, 0];
  const [r, g, b] = m.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);

// light theme
await page.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
await page.waitForTimeout(400);
await page.locator("button", { hasText: "Daylight Briefing" }).first().click();
await page.waitForTimeout(500);

await page.locator('nav[aria-label="Primary"] button', { hasText: "SUSPECTS" }).first().click();
await page.waitForTimeout(2600);
const cluster = await page.evaluate(() => {
  const svg = document.querySelector("svg[aria-label='Suspect cluster graph']");
  if (!svg) return null;
  const label = svg.querySelector("text");
  const node = svg.querySelector("circle");
  const line = svg.querySelector("line");
  const panel = svg.closest(".hud-panel");
  const ls = getComputedStyle(label);
  const ns = getComputedStyle(node);
  const lis = getComputedStyle(line);
  return {
    theme: document.documentElement.getAttribute("data-theme"),
    labelFill: ls.fill,
    labelStroke: ls.stroke,
    labelStrokeWidth: ls.strokeWidth,
    nodeStroke: ns.stroke,
    edgeStroke: lis.stroke,
    panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
  };
});
await page.screenshot({ path: "shots/fix2-suspects-light-1440.png" });

await page.locator('nav[aria-label="Primary"] button', { hasText: "TRAIL" }).first().click();
await page.waitForTimeout(3000);
const trail = await page.evaluate(() => {
  const live = document.querySelector("main");
  const green = [].slice.call(document.querySelectorAll("main *")).find((el) => /rgb\\(21, 128, 61\\)|rgb\\(34, 197, 94\\)/.test(getComputedStyle(el).color));
  const panel = document.querySelector("main .hud-panel");
  return {
    liveGreenColor: green ? getComputedStyle(green).color : null,
    panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
    bodyWeight: getComputedStyle(document.querySelector(".pane-trail b") || document.body).fontWeight,
  };
});
await page.screenshot({ path: "shots/fix2-trail-light-1440.png" });

const out = { cluster, trail, errors };
if (cluster) {
  out.contrast = {
    labelVsPanel: cluster.panelBg ? ratio(lum(cluster.labelFill), lum(cluster.panelBg)) : null,
    greenVsPanel: trail.liveGreenColor && trail.panelBg ? ratio(lum(trail.liveGreenColor), lum(trail.panelBg)) : null,
  };
}
await ctx.close();
await browser.close();
console.log(JSON.stringify(out, null, 2));
