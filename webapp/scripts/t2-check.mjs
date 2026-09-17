// T2 evidence harness: walk all panes, exercise interactivity, collect errors.
import { chromium } from "playwright-core";
import fs from "node:fs";

const URL = "http://localhost:5173/";
const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });

const LABELS = {
  map: "MAP", alerts: "ALERTS", qr: "QR", entities: "ENTITIES",
  transactions: "TXNS", dashboard: "DASHBOARD", reports: "REPORTS",
  engine: "ENGINE ROOM", system: "SYSTEM",
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(800);

const report = { themeOnFreshLoad: await page.evaluate(() => document.documentElement.getAttribute("data-theme")) };

async function openPane(id) {
  await page.locator('nav[aria-label="Primary"] button', { hasText: LABELS[id] }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/t2-${id}.png` });
}

// walk panes
for (const id of Object.keys(LABELS)) await openPane(id);

// ALERTS: analyse a FRAUD sample
await openPane("alerts");
await page.locator('button', { hasText: "FRAUD" }).first().click();
await page.locator('button', { hasText: "ANALYSE" }).first().click();
await page.waitForTimeout(1200);
report.smsVerdict = (await page.locator("text=/SMS_[A-Z_]+/").first().textContent().catch(() => null));
report.smsRiskVisible = await page.locator("text=/risk \\d+\\/100/").first().isVisible().catch(() => false);
await page.screenshot({ path: `${OUT}/t2-alerts-result.png` });

// SYSTEM: BNSS strict toggle
await openPane("system");
report.illegalWarningWhenOff = await page.locator("text=/ILLEGAL/").first().isVisible().catch(() => false);
await page.locator('button', { hasText: "STRICT: OFF" }).first().click();
await page.waitForTimeout(300);
report.strictNowOn = await page.locator('button', { hasText: "STRICT: ON" }).first().isVisible().catch(() => false);
report.illegalWarningWhenOn = await page.locator("text=/ILLEGAL/").first().isVisible().catch(() => false);
await page.screenshot({ path: `${OUT}/t2-system.png` });

// REPORTS: export PDF (expect a download)
await openPane("reports");
let downloadName = null;
try {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 45000 }),
    page.locator('button', { hasText: "EXPORT PDF" }).first().click(),
  ]);
  downloadName = dl.suggestedFilename();
} catch (e) {
  report.exportError = String(e.message || e);
}
report.pdfDownload = downloadName;
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/t2-reports.png` });

report.provenanceChips = await page.locator(".hud-chip", { hasText: /^(SIM|LIVE)$/ }).count();

// theme persistence: pick crimson, reload, expect crimson; clear, reload, expect cobalt
await openPane("system");
await page.locator('button', { hasText: "Bloodhound Crimson" }).first().click();
await page.waitForTimeout(300);
report.afterPickCrimson = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
report.afterReload = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
report.afterClearReload = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

report.errors = errors;
await browser.close();
console.log(JSON.stringify(report, null, 2));
