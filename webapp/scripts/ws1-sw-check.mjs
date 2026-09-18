// WS1 evidence: service worker registration + offline fallback to the 404 page.
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4173";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};

async function run(width, label) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 1024 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  let swReady = false;
  try {
    swReady = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active));
  } catch (err) { /* ignore */ }
  const regs = await page.evaluate(() =>
    navigator.serviceWorker.getRegistrations().then((list) => list.map((r) => r.active && r.active.scriptURL))
  );

  // direct view of the 404 page (online)
  await page.goto(BASE + "/404.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const online404 = await page.evaluate(() => document.body.innerText.indexOf("SIGNAL LOST") >= 0);
  await page.screenshot({ path: `${OUT}/ws1-404-online-${label}.png` });

  // back to the app, then go offline and reload a deep navigation
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  let offline404 = false;
  try {
    await page.goto(BASE + "/some/offline/deep-route", { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (err) { /* navigation may reject; SW should still answer */ }
  await page.waitForTimeout(900);
  try {
    offline404 = await page.evaluate(() => document.body.innerText.indexOf("SIGNAL LOST") >= 0);
  } catch (err) { /* ignore */ }
  await page.screenshot({ path: `${OUT}/ws1-404-offline-${label}.png` });

  // recovery
  await ctx.setOffline(false);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const recovered = await page.evaluate(() => !!document.querySelector("#root"));

  await ctx.close();
  return { width, swReady, regs, online404, offline404, recovered, errors };
}

report.desktop = await run(1440, "1440");
report.mobile = await run(390, "390");

await browser.close();
console.log(JSON.stringify(report, null, 2));
