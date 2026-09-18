// Radar-polish evidence: sonar sweep at 1440 + 390 + reduced motion.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:4173/404.html";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};

async function shot(label, viewport, opts) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const canvas = await page.evaluate(() => {
    const c = document.getElementById("sweep");
    return c ? { w: c.width, h: c.height } : null;
  });
  await page.screenshot({ path: `shots/ws1-sonar-${label}.png` });
  await ctx.close();
  return { canvas, errors };
}

out.desktop = await shot("1440", { width: 1440, height: 900 });
out.mobile = await shot("390", { width: 390, height: 844 });
out.reduced = await shot("reduced", { width: 1440, height: 900 }, { reducedMotion: "reduce" });

await browser.close();
console.log(JSON.stringify(out, null, 2));
