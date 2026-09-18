// WS4 evidence: parity bundles (a)-(i) against the real server.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
const out = {};
const nav = (t) => page.locator('nav[aria-label="Primary"] button', { hasText: t }).first().click();

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1000);

/* (g) INGEST state + IST clock */
out.headerChips = await page.locator("header .hud-chip").allTextContents();
out.clock = await page.locator("header span.tabular-nums").first().textContent().catch(() => null);

/* (a) map tools */
await nav("MAP");
await page.waitForTimeout(2500);
out.mapButtons = await page.locator(".tm-controls .tm-btn").allTextContents();
const pathsBefore = await page.locator(".leaflet-overlay-pane path").count();
await page.locator(".tm-btn", { hasText: "RISK LAYER" }).first().click();
await page.waitForTimeout(400);
const pathsAfter = await page.locator(".leaflet-overlay-pane path").count();
await page.locator(".tm-btn", { hasText: "RISK LAYER" }).first().click();
await page.waitForTimeout(300);
out.riskToggle = { before: pathsBefore, after: pathsAfter };
const h0 = await page.locator(".term-map__canvas").getAttribute("data-horizon");
await page.locator(".tm-btn", { hasText: "PLAY" }).first().click();
await page.waitForTimeout(3500);
const h1 = await page.locator(".term-map__canvas").getAttribute("data-horizon");
await page.locator(".tm-btn", { hasText: "PAUSE" }).first().click();
out.playback = { from: h0, to: h1, changed: h0 !== h1 };
await page.locator(".tm-btn", { hasText: "RECENTER" }).first().click();
await page.waitForTimeout(600);
out.recenterClicked = true;
await page.screenshot({ path: "shots/ws4-map-1440.png" });

/* (d) trail suspicion */
await nav("TRAIL");
await page.waitForTimeout(3500);
out.suspicionVisible = await page.locator("text=/Suspicion:/").first().isVisible().catch(() => false);
out.suspicionText = await page.locator("text=/Suspicion:/").first().textContent().catch(() => null);

/* (e) dossier letterhead + lineage + export */
await nav("REPORTS");
await page.waitForTimeout(1200);
const dossier = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    hasI4C: t.indexOf("INDIAN CYBER CRIME COORDINATION CENTRE") >= 0,
    hasRef: /REF:\s*AIR-I4C-/.test(t),
    hasLineage: t.indexOf("Lineage:") >= 0,
    hasStatutory: t.indexOf("STATUTORY MANDATE") >= 0,
    hasDispatch: t.indexOf("DISPATCHED TO") >= 0,
  };
});
out.dossierDom = dossier;
try {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator('button', { hasText: "EXPORT PDF" }).first().click(),
  ]);
  await dl.saveAs("shots/ws4-dossier.pdf");
  out.pdf = { name: dl.suggestedFilename(), bytes: fs.statSync("shots/ws4-dossier.pdf").size };
} catch (err) {
  out.pdfError = String(err.message || err).split("\n")[0];
}
await page.screenshot({ path: "shots/ws4-reports-1440.png" });

/* (f) reset to defaults */
await nav("SYSTEM");
await page.waitForTimeout(700);
const alpha = page.locator('input[type="range"]').nth(2);
await alpha.fill("0.9");
await page.waitForTimeout(300);
const betaBefore = await page.locator("text=/α \\(excitation\\)/").count();
await page.locator("button", { hasText: "RESET TO DEFAULTS" }).first().click();
await page.waitForTimeout(400);
out.reset = {
  alphaAfter: await alpha.inputValue(),
  strictAfter: await page.locator("button", { hasText: "STRICT: ON" }).first().isVisible().catch(() => false),
};
await page.screenshot({ path: "shots/ws4-system-1440.png" });

/* (h) suspect factor chips */
await nav("SUSPECTS");
await page.waitForTimeout(1200);
out.factorChips = await page.locator(".hud-chip", { hasText: /repeat|multi-terminal|high value|watchlisted|single sighting/ }).count();
await page.screenshot({ path: "shots/ws4-suspects-1440.png" });

/* (b) QR history persistence + (c) armed persistence (same context -> reload) */
await nav("QR");
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "LOAD & ANALYSE" }).first().click();
await page.waitForTimeout(1500);
out.historyBeforeReload = await page.locator("button", { hasText: "RE-RUN" }).count();
await page.locator("button", { hasText: "ENABLE ALERTS" }).first().click().catch(() => {});
await page.waitForTimeout(400);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await nav("QR");
await page.waitForTimeout(1200);
out.historyAfterReload = await page.locator("button", { hasText: "RE-RUN" }).count();
out.armedAfterReload = await page.locator("header button", { hasText: "ALERTS ARMED" }).count();
await page.screenshot({ path: "shots/ws4-qr-1440.png" });

out.errors = errors;
await ctx.close();

/* (i) mobile 5-tab bottom nav incl. CASE */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mctx.newPage();
const mErrors = [];
mp.on("console", (m) => { if (m.type() === "error") mErrors.push("mobile console: " + m.text()); });
mp.on("pageerror", (e) => mErrors.push("mobile pageerror: " + (e && e.message ? e.message : String(e))));
await mp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(1200);
out.mobileTabs = await mp.locator('nav[aria-label="Bottom"] .hud-label').allTextContents();
await mp.locator('nav[aria-label="Bottom"] button', { hasText: "CASE" }).first().click();
await mp.waitForTimeout(600);
out.mobileCaseSheet = await mp.locator('div[role="dialog"]', { hasText: "CONTEXT" }).count();
out.mobileOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await mp.screenshot({ path: "shots/ws4-mobile-390.png" });
out.mobileErrors = mErrors;
await mctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
