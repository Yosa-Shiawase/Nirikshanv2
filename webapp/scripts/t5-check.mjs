// T5 evidence harness: responsive shell + overflow scan at 360/768/1280/1440/1920.
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 768, 1280, 1440, 1920];
const RAIL = { map: "MAP", alerts: "ALERTS", qr: "QR", entities: "ENTITIES", transactions: "TXNS", dashboard: "DASHBOARD", reports: "REPORTS", engine: "ENGINE ROOM", system: "SYSTEM" };

const overflowScan = (page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest(".leaflet-container")) return; // map tiles legitimately overflow
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        bad.push(`${el.tagName}.${String(el.className || "").slice(0, 30)} right=${Math.round(r.right)}`);
      }
    });
    return { vw, count: bad.length, sample: bad.slice(0, 6) };
  });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 1024, isMobile: w < 1024 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const shell = {
    desktopRail: await page.locator('nav[aria-label="Primary"]').count(),
    bottomNav: await page.locator('nav[aria-label="Bottom"]').count(),
    drawer: await page.locator('aside[aria-label="Context"]').count(),
  };

  const rec = { width: w, shell, errors, panes: {} };

  if (w >= 1024) {
    for (const [id, label] of Object.entries(RAIL)) {
      await page.locator('nav[aria-label="Primary"] button', { hasText: label }).first().click();
      await page.waitForTimeout(500);
      rec.panes[id] = await overflowScan(page);
      if (["map", "transactions", "entities"].includes(id)) {
        await page.screenshot({ path: `${OUT}/t5-${w}-${id}.png` });
      }
    }
  } else {
    // mobile: bottom nav + MORE sheet + context sheet
    await page.locator('nav[aria-label="Bottom"] button', { hasText: "MAP" }).first().click();
    await page.waitForTimeout(1200);
    rec.panes.map = await overflowScan(page);
    await page.screenshot({ path: `${OUT}/t5-${w}-map.png` });

    await page.locator('nav[aria-label="Bottom"] button', { hasText: "ALERTS" }).first().click();
    await page.waitForTimeout(600);
    rec.panes.alerts = await overflowScan(page);

    await page.locator('nav[aria-label="Bottom"] button', { hasText: "MORE" }).first().click();
    await page.waitForTimeout(400);
    rec.moreSheetOpen = await page.locator('div[role="dialog"]', { hasText: "MORE PANES" }).count();
    await page.screenshot({ path: `${OUT}/t5-${w}-more.png` });
    await page.locator('div[role="dialog"] button', { hasText: "TXNS" }).first().click();
    await page.waitForTimeout(600);
    rec.panes.transactions = await overflowScan(page);
    await page.screenshot({ path: `${OUT}/t5-${w}-transactions.png` });

    // context sheet from header
    await page.locator("header button", { hasText: /▤/ }).first().click();
    await page.waitForTimeout(500);
    rec.contextSheetOpen = await page.locator('div[role="dialog"]', { hasText: "CONTEXT" }).count();
    rec.panes.contextSheet = await overflowScan(page);
    await page.screenshot({ path: `${OUT}/t5-${w}-context.png` });
  }

  results.push(rec);
  await ctx.close();
}

await browser.close();
const compact = results.map((r) => ({
  width: r.width,
  shell: r.shell,
  moreSheetOpen: r.moreSheetOpen,
  contextSheetOpen: r.contextSheetOpen,
  overflowByPane: Object.fromEntries(Object.entries(r.panes).map(([k, v]) => [k, v.count])),
  worstSamples: Object.entries(r.panes).filter(([, v]) => v.count > 0).map(([k, v]) => `${k}: ${v.sample[0]}`),
  errors: r.errors,
}));
console.log(JSON.stringify(compact, null, 2));
