// T6 evidence: React app served by app.py on :8080 + legacy console at /legacy/.
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:8080";
const PANES = [
  ["MAP", "RISK MAP"],
  ["ALERTS", "ALERTS"],
  ["QR", "QR FORENSICS"],
  ["ENTITIES", "ENTITIES"],
  ["TXNS", "TRANSACTIONS"],
  ["DASHBOARD", "DASHBOARD"],
  ["REPORTS", "REPORTS"],
  ["ENGINE ROOM", "ENGINE ROOM"],
  ["SYSTEM", "SYSTEM"],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};
const errors = [];

/* ---------- real server: React app ---------- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("desktop console: " + m.text()); });
page.on("pageerror", (e) => errors.push("desktop pageerror: " + (e && e.message ? e.message : String(e))));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

report.reactRoot = await page.evaluate(() => !!document.querySelector("#root"));
report.servedBy8080 = page.url().startsWith(BASE);
report.panes = {};
for (const [label, expect] of PANES) {
  await page.locator('nav[aria-label="Primary"] button', { hasText: label }).first().click();
  await page.waitForTimeout(550);
  const h2 = (await page.locator("main h2").first().textContent().catch(() => "")) || "";
  report.panes[label] = h2.toUpperCase().indexOf(expect) >= 0;
}
await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
await page.waitForTimeout(2500);
report.mapMarkers = await page.locator(".term-map__canvas").getAttribute("data-marker-count");
report.swRegistered = await page.evaluate(() =>
  "serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : -1
);
report.sseConnected = await page.evaluate(() => document.body.innerText.indexOf("CONNECTED") >= 0);
await page.screenshot({ path: `${OUT}/t6-reactsrv-1440.png` });

// QR camera unreachable -> graceful status
await page.locator('nav[aria-label="Primary"] button', { hasText: "QR" }).first().click();
await page.waitForTimeout(700);
await page.locator("button", { hasText: "START CAMERA" }).first().click();
await page.waitForTimeout(1500);
report.cameraStatus = await page.locator(".qr-cam__badge").textContent().catch(() => null);

// dossier PDF download
await page.locator('nav[aria-label="Primary"] button', { hasText: "REPORTS" }).first().click();
await page.waitForTimeout(900);
try {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator('button', { hasText: "EXPORT PDF" }).first().click(),
  ]);
  const p = `${OUT}/t6-dossier.pdf`;
  await dl.saveAs(p);
  report.pdfName = dl.suggestedFilename();
  report.pdfBytes = fs.statSync(p).size;
} catch (err) {
  report.pdfError = String(err.message || err).split("\n")[0];
}
await page.screenshot({ path: `${OUT}/t6-reports-1440.png` });

// legacy console click-through
await page.goto(BASE + "/legacy/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
report.legacy = await page.evaluate(() => ({
  railBtns: document.querySelectorAll(".rail-btn").length,
  hasAlertsPane: !!document.getElementById("pane-alerts"),
  hasLeaflet: !!document.querySelector(".leaflet-container"),
}));
const alertsBtn = page.locator('.rail-btn[data-v="alerts"]').first();
const clicked = await alertsBtn.count();
if (clicked) {
  await alertsBtn.click();
  await page.waitForTimeout(600);
  report.legacyPaneSwitch = await page.evaluate(() => {
    const p = document.getElementById("pane-alerts");
    return !!p && p.classList.contains("active");
  });
} else {
  report.legacyPaneSwitch = "no rail-btn[data-v=alerts]";
}
await page.screenshot({ path: `${OUT}/t6-legacy-1440.png` });
report.desktopErrors = errors.slice();
await ctx.close();

/* ---------- mobile: 390 on real server ---------- */
const mErrors = [];
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mpage = await mctx.newPage();
mpage.on("console", (m) => { if (m.type() === "error") mErrors.push("mobile console: " + m.text()); });
mpage.on("pageerror", (e) => mErrors.push("mobile pageerror: " + (e && e.message ? e.message : String(e))));
await mpage.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mpage.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mpage.waitForTimeout(2000);
report.mobileBottomNav = await mpage.locator('nav[aria-label="Bottom"]').count();
report.mobileOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await mpage.screenshot({ path: `${OUT}/t6-reactsrv-390.png` });
report.mobileErrors = mErrors;
await mctx.close();

await browser.close();
console.log(JSON.stringify(report, null, 2));
