// T1 evidence harness: real Chrome screenshots at 390px and 1440px + layout checks.
// Not a project deliverable — dev verification only.
import { chromium } from "playwright-core";
import fs from "node:fs";

const URL = "http://localhost:5173/";
const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1440", width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-preloader-${vp.name}.png` });

  await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-app-${vp.name}.png` });

  if (vp.mobile) {
    // open the MORE bottom sheet
    const btn = page.locator("nav[aria-label='Bottom'] button", { hasText: "MORE" }).first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/03-more-sheet-${vp.name}.png` });
  }

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: de.scrollWidth,
      hasHorizontalScroll: de.scrollWidth > window.innerWidth + 1,
      desktopNavRail: !!document.querySelector('nav[aria-label="Primary"]'),
      mobileBottomNav: !!document.querySelector('nav[aria-label="Bottom"]'),
      contextDrawer: !!document.querySelector('aside[aria-label="Context"]'),
      theme: de.getAttribute("data-theme"),
      bootState: document.querySelector("[data-nir-boot]")?.getAttribute("data-nir-boot"),
      preloaderGone: !document.querySelector(".pl-overlay"),
      navItemCount: document.querySelectorAll('nav[aria-label="Primary"] button').length,
    };
  });

  report.push({ viewport: vp.name, ...info, errors });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
