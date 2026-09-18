// MAP TOOLS consolidation evidence: every moved control re-verified functional.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = { errors: [] };

async function openTools(page) {
  const btn = page.locator(".tm-tools__btn");
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.waitForTimeout(250);
}
const tileSrcs = (page) => page.evaluate(() => [].slice.call(document.querySelectorAll(".leaflet-tile-pane img")).map((i) => i.src));
const center = (page) => page.locator(".term-map__canvas").getAttribute("data-center");

/* ---------------- desktop ---------------- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") out.errors.push("console: " + m.text()); });
page.on("pageerror", (e) => out.errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
await page.waitForTimeout(2600);

const canvas = page.locator(".term-map__canvas");
out.initial = {
  toolsClosed: (await page.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "false",
  chaseFloating: await page.locator(".tm-top-left .tm-btn--chase").count(),
  legendFloating: await page.locator(".tm-top-right .tm-legend").count(),
  leafletZoomTopRight: await page.locator(".leaflet-top.leaflet-right .leaflet-control-zoom").count(),
};
await page.screenshot({ path: "shots/mt-1440-closed.png" });

await openTools(page);
out.panelOpen = (await page.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "true";
await page.screenshot({ path: "shots/mt-1440-open.png" });

// closed via X / Esc / outside tap
await page.locator(".tm-panel button[aria-label='Close map tools']").click();
await page.waitForTimeout(200);
out.closeByX = (await page.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "false";
await openTools(page);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
out.closeByEsc = (await page.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "false";
await openTools(page);
await page.mouse.click(700, 500);
await page.waitForTimeout(250);
out.closeByOutside = (await page.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "false";

// basemaps
await openTools(page);
const before = await tileSrcs(page);
await page.locator(".tm-panel label", { hasText: "Streets (OSM)" }).click();
await page.waitForTimeout(1800);
const afterStreets = await tileSrcs(page);
out.basemapSwitch = { before: before[0] || null, after: afterStreets[0] || null, changed: before[0] !== afterStreets[0] && /openstreetmap/.test(afterStreets[0] || "") };
await page.locator(".tm-panel label", { hasText: "Dark Ops" }).click();
await page.waitForTimeout(1200);

// labels + terrain
await page.locator(".tm-panel label", { hasText: "Place labels" }).click();
await page.waitForTimeout(1500);
out.labelsOn = (await tileSrcs(page)).some((s) => /World_Boundaries_and_Places/.test(s));
await page.locator(".tm-panel label", { hasText: "Terrain hillshade" }).click();
await page.waitForTimeout(1500);
out.terrainOn = (await tileSrcs(page)).some((s) => /World_Hillshade/.test(s));
await page.locator(".tm-panel label", { hasText: "Place labels" }).click();
await page.locator(".tm-panel label", { hasText: "Terrain hillshade" }).click();
await page.waitForTimeout(800);

// layers
const markersOn = Number(await canvas.getAttribute("data-marker-count"));
await page.locator(".tm-panel label", { hasText: "Risk heat" }).click();
await page.waitForTimeout(400);
const markersOff = await page.locator(".leaflet-overlay-pane path").count();
await page.locator(".tm-panel label", { hasText: "Risk heat" }).click();
await page.waitForTimeout(400);
await page.locator(".tm-panel label", { hasText: "UPI volume" }).click();
await page.waitForTimeout(500);
out.upiLayer = { circles: await canvas.getAttribute("data-upi"), visible: await page.locator(".leaflet-overlay-pane path").count() };
await page.locator(".tm-panel label", { hasText: "Fraud incidents" }).click();
await page.waitForTimeout(700);
out.incidentLayer = { dots: await canvas.getAttribute("data-incidents") };

// refresh
await page.locator(".tm-panel button", { hasText: "REFRESH" }).click();
await page.waitForTimeout(600);
out.refreshToast = await page.locator(".tm-toast", { hasText: "Map layers refreshed" }).count();

// ATM with state text
const atmRow = page.locator(".tm-panel button", { hasText: "ATM LAYER" }).first();
await atmRow.click();
await page.waitForTimeout(300);
out.atmFetchingText = (await page.locator(".tm-state").first().textContent()) || "";
await page.waitForFunction(() => {
  const el = document.querySelector(".tm-state");
  return el && !/fetching/.test(el.textContent);
}, { timeout: 90000 }).catch(() => {});
out.atmFinalText = (await page.locator(".tm-state").first().textContent()) || "";

// view: playback, confidence, recenter
const h0 = await canvas.getAttribute("data-horizon");
await page.locator(".tm-panel button", { hasText: "PLAY HORIZON" }).click();
await page.waitForTimeout(3500);
const h1 = await canvas.getAttribute("data-horizon");
await page.locator(".tm-panel button", { hasText: "PAUSE HORIZON" }).click();
out.playback = { from: h0, to: h1, changed: h0 !== h1 };
const confA = await page.locator(".tm-panel [data-conf]").textContent();
await page.locator(".tm-panel label", { hasText: "+24h" }).click();
await page.waitForTimeout(500);
const confB = await page.locator(".tm-panel [data-conf]").textContent();
out.confidence = { atNow: confA, at24h: confB, changed: confA !== confB };
await page.locator(".tm-panel label", { hasText: "NOW" }).click();
await page.waitForTimeout(300);
await page.locator(".tm-panel button", { hasText: "RECENTER" }).click();
await page.waitForTimeout(1500);
out.recenter = { center: await center(page) };
await page.screenshot({ path: "shots/mt-1440-view.png" });

// no duplicate controls
out.duplicates = await page.evaluate(() => {
  const probe = ["Dark Ops (ESRI)", "Satellite (ESRI)", "Streets (OSM)", "REFRESH", "ATM LAYER (LIVE OSM)", "RECENTER (all-India)", "Risk heat (Hawkes)"];
  return probe.map((t) => {
    const n = [].slice.call(document.querySelectorAll("button, label")).filter((e) => e.textContent.trim().indexOf(t) === 0).length;
    return `${t}:${n}`;
  });
});

// chase untouched
await page.keyboard.press("Escape");
await page.locator(".tm-top-left .tm-btn--chase").click();
await page.waitForTimeout(28000);
const lines = await page.locator(".tm-log__line").allTextContents();
out.chase = {
  logCount: lines.length,
  moved: lines.filter((l) => l.includes("moved")).length,
  hasCaseOpen: lines.some((l) => /CASE OPENED/.test(l)),
  hasCashOut: lines.some((l) => /CASH-OUT PREDICTED/.test(l)),
};
await page.screenshot({ path: "shots/mt-1440-chase.png" });
await ctx.close();

/* ---------------- mobile ---------------- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mctx.newPage();
mp.on("console", (m) => { if (m.type() === "error") out.errors.push("mobile console: " + m.text()); });
mp.on("pageerror", (e) => out.errors.push("mobile pageerror: " + (e && e.message ? e.message : String(e))));
await mp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mp.locator('nav[aria-label="Bottom"] button', { hasText: "MAP" }).first().click();
await mp.waitForTimeout(2500);
await mp.screenshot({ path: "shots/mt-390-closed.png" });
await mp.locator(".tm-tools__btn").click();
await mp.waitForTimeout(400);
out.mobile = {
  open: (await mp.locator(".tm-tools__btn").getAttribute("aria-expanded")) === "true",
  panelWidth: await mp.evaluate(() => Math.round(document.querySelector(".tm-panel").getBoundingClientRect().width)),
  viewportW: 390,
  rowMinHeights: await mp.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll(".tm-panel .tm-row, .tm-panel .tm-sec__head, .tm-panel .tm-hz__item"));
    return rows.slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height));
  }),
  horizontalScroll: await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
};
await mp.screenshot({ path: "shots/mt-390-open.png" });
// a mobile control actually works
await mp.locator(".tm-panel label", { hasText: "UPI volume" }).click();
await mp.waitForTimeout(600);
out.mobile.upiCircles = await mp.locator(".term-map__canvas").getAttribute("data-upi");
await mctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
