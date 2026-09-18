import { chromium } from "playwright-core";

const PDF = "file:///C:/Users/shubham%20kumar/.openclaw-autoclaw/workspace/nirakshan/webapp/shots/ws4-dossier.pdf";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1300 }, acceptDownloads: false });
const page = await ctx.newPage();
const info = { url: PDF };
try {
  await page.goto(PDF, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2500);
  info.renderedEmbed = await page.evaluate(() => !!document.querySelector("embed, object, iframe"));
  info.docTitle = await page.title();
  await page.screenshot({ path: "shots/ws4-pdf-open.png" });
  info.screenshot = "shots/ws4-pdf-open.png";
} catch (err) {
  info.error = String(err.message || err).split("\n")[0];
}
await browser.close();
console.log(JSON.stringify(info, null, 2));
