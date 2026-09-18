// FIX 1 evidence: per-node EXPORT REPORT from the case card (desktop + mobile).
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = { desktop: [], mobile: null, errors: [] };

/* ---------- desktop: three different nodes ---------- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") out.errors.push("console: " + m.text()); });
page.on("pageerror", (e) => out.errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
await page.waitForTimeout(2600);

const nodeId = () => page.locator('section[aria-label="Node case card"] .text-lg').first().textContent();
const paths = page.locator(".leaflet-overlay-pane path");

for (const idx of [0, 4, 8]) {
  const before = (await nodeId()) || "";
  let clicked = true;
  try {
    await paths.nth(idx).click({ timeout: 4000 });
  } catch (err) {
    clicked = false;
  }
  await page.waitForTimeout(500);
  const after = (await nodeId()) || "";
  let rec = { idx, clicked, before: before.trim(), after: after.trim(), changed: before.trim() !== after.trim() };
  if (!rec.changed) {
    // fall back: focus via the complaint tail / archive list
    await page.locator('nav[aria-label="Primary"] button', { hasText: "REPORTS" }).first().click();
    await page.waitForTimeout(700);
    const btns = page.locator('div[role="none"] , button');
    await page.locator("button", { hasText: /^(DL-01|MUM-01|BLR-01|HYD-01|LKO-01|JAI-01|SGR-01|AMD-01|IND-01|CCU-01|MAA-01)$/ }).nth(idx === 0 ? 1 : idx === 4 ? 5 : 9).click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
    await page.waitForTimeout(1200);
    rec.after = ((await nodeId()) || "").trim();
    rec.changed = rec.before !== rec.after;
  }
  const dossierText = await page.locator('section[aria-label="Node case card"]').textContent();
  rec.hasExportBtn = await page.locator('section[aria-label="Node case card"] button', { hasText: "EXPORT REPORT" }).count();
  try {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.locator('section[aria-label="Node case card"] button', { hasText: "EXPORT REPORT" }).first().click(),
    ]);
    const p = `shots/fix1-${rec.after}.pdf`;
    await dl.saveAs(p);
    rec.pdf = { name: dl.suggestedFilename(), bytes: fs.statSync(p).size };
    // confirm the rendered dossier (pre-raster) matches THIS node
    rec.dossierMatchesNode = await page.evaluate((nid) => {
      const t = document.body.innerText;
      return t.indexOf("Node " + nid) >= 0;
    }, rec.after);
  } catch (err) {
    rec.pdfError = String(err.message || err).split("\n")[0];
  }
  await page.locator("button", { hasText: "CLOSE" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  out.desktop.push(rec);
}
await page.screenshot({ path: "shots/fix1-desktop-1440.png" });
await ctx.close();

/* ---------- mobile: export from the CASE sheet ---------- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
const mp = await mctx.newPage();
mp.on("console", (m) => { if (m.type() === "error") out.errors.push("mobile console: " + m.text()); });
mp.on("pageerror", (e) => out.errors.push("mobile pageerror: " + (e && e.message ? e.message : String(e))));
await mp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(1500);
await mp.locator('nav[aria-label="Bottom"] button', { hasText: "CASE" }).first().click();
await mp.waitForTimeout(700);
const mrec = { node: ((await mp.locator('div[role="dialog"] .text-lg').first().textContent()) || "").trim() };
mrec.hasExportBtn = await mp.locator('div[role="dialog"] button', { hasText: "EXPORT REPORT" }).count();
try {
  const [dl] = await Promise.all([
    mp.waitForEvent("download", { timeout: 60000 }),
    mp.locator('div[role="dialog"] button', { hasText: "EXPORT REPORT" }).first().click(),
  ]);
  await dl.saveAs(`shots/fix1-mobile-${mrec.node}.pdf`);
  mrec.pdf = { name: dl.suggestedFilename(), bytes: fs.statSync(`shots/fix1-mobile-${mrec.node}.pdf`).size };
} catch (err) {
  mrec.pdfError = String(err.message || err).split("\n")[0];
}
await mp.screenshot({ path: "shots/fix1-mobile-390.png" });
out.mobile = mrec;
await mctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
