// T3 evidence harness: map markers, horizon re-scoring, ATM layer, chase.
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});
await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
await page.waitForSelector(".term-map__canvas", { timeout: 10000 });
await page.waitForTimeout(2500);

const canvas = page.locator(".term-map__canvas");
const chaseBtn = page.locator(".tm-btn--chase");
const atmBtn = page.locator(".tm-btn", { hasText: "ATM" }).first();
const waitAtmIdle = () =>
  page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll(".tm-btn")].find((x) => /ATM/.test(x.textContent));
        return b && !b.disabled;
      },
      { timeout: 45000 }
    )
    .catch(() => {});

const report = {};

// --- markers + horizon ---
report.markerCount = await canvas.getAttribute("data-marker-count");
report.horizonNow = await canvas.getAttribute("data-horizon");
report.scoresNow = JSON.parse((await canvas.getAttribute("data-scores")) || "[]");
await page.screenshot({ path: `${OUT}/t3-map-now.png` });

await page.locator(".tm-horizon button", { hasText: "+24h" }).first().click();
await page.waitForTimeout(900);
report.horizon24 = await canvas.getAttribute("data-horizon");
report.scores24 = JSON.parse((await canvas.getAttribute("data-scores")) || "[]");
await page.screenshot({ path: `${OUT}/t3-map-24h.png` });

report.changedByHorizon = JSON.stringify(report.scoresNow) !== JSON.stringify(report.scores24);
report.p0Now = report.scoresNow.filter((s) => s.score >= 80).length;
report.p0At24 = report.scores24.filter((s) => s.score >= 80).length;
report.p0RingsAt24 = await page.locator(".risk-pulse").count();

await page.locator(".tm-horizon button", { hasText: "NOW" }).first().click();
await page.waitForTimeout(300);

// --- ATM layer (explicit) ---
await atmBtn.click();
await waitAtmIdle();
report.atmBtn = (await atmBtn.textContent()).trim();
report.atmNote = await page.locator(".tm-note").textContent().catch(() => null);
await page.screenshot({ path: `${OUT}/t3-atms.png` });

// --- STOP test (start, then abort) ---
await chaseBtn.click();
await page.waitForTimeout(2500);
report.labelWhileRunning = (await chaseBtn.textContent()).trim();
report.logCountWhileRunning = await page.locator(".tm-log__line").count();
await page.screenshot({ path: `${OUT}/t3-chase-mid.png` });
await chaseBtn.click();
await page.waitForTimeout(700);
report.labelAfterStop = (await chaseBtn.textContent()).trim();
report.logCountAfterStop = await page.locator(".tm-log__line").count();

// --- full chase run ---
await chaseBtn.click();
await page.waitForTimeout(3000);
report.toastSeen = (await page.locator(".tm-toast").count()) > 0;
await page.waitForTimeout(27000);
report.labelAfterRun = (await chaseBtn.textContent()).trim();
const logLines = await page.locator(".tm-log__line").allTextContents();
report.chaseLogCount = logLines.length;
report.chaseLogMoved = logLines.filter((l) => l.includes("moved")).length;
report.chaseLogHasCaseOpen = logLines.some((l) => /CASE OPENED/i.test(l));
report.chaseLogHasCashOut = logLines.some((l) => /CASH-OUT PREDICTED/i.test(l));
report.chaseLogSample = logLines.slice(0, 14);
await waitAtmIdle();
report.atmNoteAfterChase = await page.locator(".tm-note").textContent().catch(() => null);
await page.screenshot({ path: `${OUT}/t3-chase-end.png` });

report.errors = errors;
await browser.close();
const compact = {
  markerCount: report.markerCount,
  horizonNow: report.horizonNow,
  horizon24: report.horizon24,
  changedByHorizon: report.changedByHorizon,
  p0Now: report.p0Now,
  p0At24: report.p0At24,
  p0RingsAt24: report.p0RingsAt24,
  scoresNow: report.scoresNow.map((s) => `${s.id}:${s.score}`).join(" "),
  scores24: report.scores24.map((s) => `${s.id}:${s.score}`).join(" "),
  atmBtn: report.atmBtn,
  atmNote: report.atmNote,
  labelWhileRunning: report.labelWhileRunning,
  logCountWhileRunning: report.logCountWhileRunning,
  labelAfterStop: report.labelAfterStop,
  logCountAfterStop: report.logCountAfterStop,
  toastSeen: report.toastSeen,
  labelAfterRun: report.labelAfterRun,
  chaseLogCount: report.chaseLogCount,
  chaseLogMoved: report.chaseLogMoved,
  chaseLogHasCaseOpen: report.chaseLogHasCaseOpen,
  chaseLogHasCashOut: report.chaseLogHasCashOut,
  atmNoteAfterChase: report.atmNoteAfterChase,
  errors: report.errors,
};
console.log(JSON.stringify(compact, null, 2));
