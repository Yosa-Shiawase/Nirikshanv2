import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});
await page.locator('nav[aria-label="Primary"] button', { hasText: "REPORTS" }).first().click();
await page.waitForTimeout(800);

const out = {};
const t0 = Date.now();
let dl = null;
try {
  const [d] = await Promise.all([
    page.waitForEvent("download", { timeout: 90000 }),
    page.locator('button', { hasText: "EXPORT PDF" }).first().click(),
  ]);
  dl = d.suggestedFilename();
  const path = `shots/export-test.pdf`;
  await d.saveAs(path);
  out.savedBytes = fs.statSync(path).size;
} catch (e) {
  out.exportWaitError = String(e.message || e).split("\n")[0];
}
out.ms = Date.now() - t0;
out.download = dl;
out.statusText = await page.locator("text=/PDF export triggered|Export failed/").first().textContent().catch(() => null);
out.overlayLeft = await page.locator(".html2pdf__overlay").count();
out.errors = errors;
await browser.close();
console.log(JSON.stringify(out, null, 2));
