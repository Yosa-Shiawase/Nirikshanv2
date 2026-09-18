// WS3 evidence: 7-palette cycler, light tokens + basemap switch, RGB animation.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};

async function session(opts, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(900);

  const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const cycleBtn = page.locator("header .hud-btn").last();

  // cycler order
  const order = [await theme()];
  for (let i = 0; i < 7; i++) {
    await cycleBtn.click();
    await page.waitForTimeout(240);
    order.push(await theme());
  }

  // return to cobalt (light + rgb sit at the end of the ring)
  await cycleBtn.click();
  await page.waitForTimeout(220);

  const setTheme = async (name) => {
    await page.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
    await page.waitForTimeout(350);
    await page.locator("button", { hasText: name }).first().click();
    await page.waitForTimeout(400);
  };

  await setTheme("Daylight Briefing");
  const lightTheme = await theme();
  await page.locator('nav[aria-label="Primary"] button', { hasText: "MAP" }).first().click();
  await page.waitForTimeout(2600);
  const lightBasemap = await page.evaluate(() => {
    const img = document.querySelector(".leaflet-tile-pane img");
    return img ? img.src : null;
  });
  const lightColors = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const panel = document.querySelector(".hud-panel");
    const activeChip = document.querySelector('.tm-horizon button[aria-pressed="true"]');
    return {
      bgCore: cs.getPropertyValue("--bg-core").trim(),
      accent: cs.getPropertyValue("--accent-cyan").trim(),
      ink: cs.getPropertyValue("--text-main").trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      panelColor: panel ? getComputedStyle(panel).color : null,
      activeChip: activeChip
        ? { text: activeChip.textContent.trim(), color: getComputedStyle(activeChip).color, bg: getComputedStyle(activeChip).backgroundColor }
        : null,
    };
  });
  await page.screenshot({ path: `shots/ws3-light-${label}.png`, animations: "disabled", timeout: 20000 });

  await setTheme("RGB Pulse");
  const rgb = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const before = getComputedStyle(document.documentElement, "::before");
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      ink: cs.getPropertyValue("--text-main").trim(),
      animationName: before.animationName,
      backgroundPosition: before.backgroundPosition,
    };
  });
  await page.locator('nav[aria-label="Primary"] button', { hasText: "DASHBOARD" }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/ws3-rgb-${label}.png`, animations: "disabled", timeout: 20000 });

  await ctx.close();
  return { order, lightTheme, lightBasemap, lightColors, rgb, errors };
}

out.normal = await session({}, "1440");
out.reducedMotion = await session({ reducedMotion: "reduce" }, "rm1440");

// mobile: light theme + no overflow
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mctx.newPage();
await mp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(1000);
const mCycle = mp.locator("header .hud-btn").last();
for (let i = 0; i < 5; i++) { await mCycle.click(); await mp.waitForTimeout(220); }
out.mobileTheme = await mp.evaluate(() => document.documentElement.getAttribute("data-theme"));
out.mobileOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await mp.screenshot({ path: "shots/ws3-mobile-390.png", animations: "disabled", timeout: 20000 });
await mctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
