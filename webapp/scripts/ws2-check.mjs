// WS2 evidence: judge-facing renames applied, old jargon gone.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const BASE = "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1000);

const out = {};
out.navLabels = await page.locator('nav[aria-label="Primary"] button .hud-label').allTextContents();

const EXPECT = {
  MAP: "LIVE CRIME MAP",
  ALERTS: "SMS SCAM DETECTOR",
  QR: "QR SCANNER",
  SUSPECTS: "SUSPECT NETWORK",
  TRAIL: "MONEY TRAIL",
  DASHBOARD: "DASHBOARD",
  REPORTS: "REPORTS",
  "ENGINE ROOM": "ENGINE ROOM",
  SYSTEM: "SYSTEM",
};
out.paneHeadings = {};
for (const [label, want] of Object.entries(EXPECT)) {
  await page.locator('nav[aria-label="Primary"] button', { hasText: label }).first().click();
  await page.waitForTimeout(450);
  const h2 = (await page.locator("main h2").first().textContent().catch(() => "")) || "";
  out.paneHeadings[label] = { h2: h2.slice(0, 60), ok: h2.toUpperCase().indexOf(want) >= 0 };
}
// drawer + chips
out.drawerLabels = await page.locator('aside[aria-label="Context"] .hud-label').allTextContents();
out.headerChips = await page.locator("header .hud-chip").allTextContents();
out.forbidden = await page.evaluate(() => {
  const bad = ["TXNS", "RISK MAP · LIVE CHASE", "SMS THREAT SENSOR", "Node Detail", "Decision log", "BNSS strict mode", "Live Complaint Tail", "Stream Health", "Anomaly Watch", "Node Case Card"];
  return bad.filter((b) => document.body.innerText.indexOf(b) >= 0);
});
await page.locator('nav[aria-label="Primary"] button', { hasText: "TRAIL" }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/ws2-trail-1440.png" });
await page.locator('nav[aria-label="Primary"] button', { hasText: "SUSPECTS" }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/ws2-suspects-1440.png" });
out.errors = errors;
await ctx.close();

// mobile MORE sheet labels
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mctx.newPage();
await mp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await mp.waitForSelector('[data-nir-boot="done"]', { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(1200);
out.mobileNav = await mp.locator('nav[aria-label="Bottom"] .hud-label').allTextContents();
await mp.locator('nav[aria-label="Bottom"] button', { hasText: "MORE" }).first().click();
await mp.waitForTimeout(500);
out.mobileSheet = await mp.locator('div[role="dialog"] .hud-label').allTextContents();
await mp.screenshot({ path: "shots/ws2-mobile-390.png" });
await mctx.close();

await browser.close();
console.log(JSON.stringify(out, null, 2));
