import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });

// 1) brand-new context, no storage at all
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p1 = await ctx1.newPage();
await p1.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await p1.waitForTimeout(1200);
const fresh = await p1.evaluate(() => ({
  dataTheme: document.documentElement.getAttribute("data-theme"),
  stored: localStorage.getItem("nir-command-theme"),
  panelBg: getComputedStyle(document.querySelector(".hud-panel") || document.body).backgroundColor,
}));
await ctx1.close();

// 2) context with a stale crimson value, then cleared
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await ctx2.newPage();
await p2.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await p2.evaluate(() => localStorage.setItem("nir-command-theme", "crimson"));
await p2.reload({ waitUntil: "domcontentloaded" });
await p2.waitForTimeout(1200);
const stale = await p2.evaluate(() => ({
  dataTheme: document.documentElement.getAttribute("data-theme"),
  stored: localStorage.getItem("nir-command-theme"),
}));
await p2.evaluate(() => localStorage.clear());
await p2.reload({ waitUntil: "domcontentloaded" });
await p2.waitForTimeout(1200);
const cleared = await p2.evaluate(() => ({
  dataTheme: document.documentElement.getAttribute("data-theme"),
  stored: localStorage.getItem("nir-command-theme"),
}));
await ctx2.close();

await browser.close();
console.log(JSON.stringify({ fresh, stale, cleared }, null, 2));
