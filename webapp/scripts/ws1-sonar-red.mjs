// Capture the rare red anomaly contact (appears for ~5s every 9–15s).
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/404.html", { waitUntil: "load" });
await page.waitForTimeout(1500);

let found = false;
for (let i = 0; i < 40 && !found; i++) {
  found = await page.evaluate(() => {
    const cv = document.getElementById("sweep");
    const c = cv.getContext("2d");
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0;
    for (let j = 0; j < d.length; j += 16) {
      if (d[j] > 110 && d[j + 3] > 40 && d[j] > d[j + 1] * 1.5 && d[j] > d[j + 2] * 1.2) red++;
    }
    return red > 8;
  });
  if (!found) await page.waitForTimeout(500);
}

await page.evaluate(() => { document.querySelector("main").style.visibility = "hidden"; });
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/ws1-sonar-redcontact-1440.png" });
console.log(JSON.stringify({ redContactCaptured: found }));
await browser.close();
