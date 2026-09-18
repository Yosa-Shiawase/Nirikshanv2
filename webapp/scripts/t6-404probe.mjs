import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const bad = [];
page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on("requestfailed", (r) => bad.push(`FAILED ${r.url()} :: ${r.failure() && r.failure().errorText}`));

await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
console.log("--- after app load ---");
console.log(bad.join("\n") || "(none)");

bad.length = 0;
await page.goto("http://localhost:8080/legacy/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("--- after /legacy/ ---");
console.log(bad.join("\n") || "(none)");

await browser.close();
