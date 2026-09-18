import { chromium } from "playwright-core";
import fs from "node:fs";
fs.mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.locator('nav[aria-label="Primary"] button', { hasText: "SYSTEM" }).first().click();
await page.waitForTimeout(400);
await page.locator("button", { hasText: "RGB Pulse" }).first().click();
await page.waitForTimeout(500);
// freeze the cycle so samples are comparable
await page.addStyleTag({ content: 'html[data-theme="rgb"]::before{animation:none !important;background-position:35% 50% !important}' });

const sample = async (points) =>
  page.evaluate(async (pts) => {
    const out = [];
    for (const [x, y] of pts) {
      const el = document.elementFromPoint(x, y);
      out.push({ x, y, tag: el ? el.tagName + "." + String(el.className || "").slice(0, 24) : null });
    }
    return out;
  }, points);

const pts = [[40, 40], [700, 30], [1400, 40], [700, 450], [40, 860], [1400, 860]];
const els = await sample(pts);

const shot = async (name) => {
  const buf = await page.screenshot();
  fs.writeFileSync(`shots/${name}.png`, buf);
  return buf.toString("base64");
};

const readPixels = async (b64, pts) =>
  page.evaluate(
    async ({ payload, points }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + payload;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      return points.map(([px, py]) => {
        const i = (py * c.width + px) * 4;
        return { px, py, rgb: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})` };
      });
    },
    { payload: b64, points: pts }
  );

const withApp = await readPixels(await shot("diag-rgb-withapp"), pts);
await page.evaluate(() => { document.getElementById("app-shell").style.display = "none"; });
await page.waitForTimeout(400);
const noApp = await readPixels(await shot("diag-rgb-noapp"), pts);

console.log(JSON.stringify({ elementsAt: els, withApp, withoutApp: noApp }, null, 2));
await browser.close();
