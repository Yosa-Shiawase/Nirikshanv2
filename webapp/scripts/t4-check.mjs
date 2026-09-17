// T4 evidence harness: F3 QR pane + F10 ENGINE ROOM.
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-nir-boot="done"]', { timeout: 25000 }).catch(() => {});

const report = {};
const nav = (label) => page.locator('nav[aria-label="Primary"] button', { hasText: label }).first().click();

/* ---------------- F3 QR ---------------- */
await nav("QR");
await page.waitForTimeout(1500);

report.demoQrImages = await page.locator('img[alt$="QR"]').count();
await page.screenshot({ path: `${OUT}/t4-qr-empty.png` });

// camera attempt (no device in headless -> graceful status)
await page.locator("button", { hasText: "START CAMERA" }).first().click();
await page.waitForTimeout(1500);
report.cameraStatus = await page.locator(".qr-cam__badge").textContent().catch(() => null);

// FRAUD demo -> analyse
await page.locator("button", { hasText: "LOAD & ANALYSE" }).first().click();
await page.waitForTimeout(1500);
report.fraudVerdict = await page.locator("text=/FLAGGED_FRAUD_RISK|SAFE_WITH_CAUTION|LIKELY_LEGIT|INVALID_URI/").first().textContent().catch(() => null);
report.forensicRows = await page.locator("text=Forensic breakdown").locator("xpath=following-sibling::table[1]//tr").count().catch(() => 0);
report.matchedRuleChips = await page.locator(".hud-chip", { hasText: /WL-HIT|SE-PHRASE|AMT-|PSP-|VPA-|WL-/ }).count();
await page.screenshot({ path: `${OUT}/t4-qr-fraud.png` });

// LEGIT demo -> analyse
await page.locator("button", { hasText: "LOAD & ANALYSE" }).nth(1).click();
await page.waitForTimeout(1500);
report.legitVerdict = await page.locator("text=/FLAGGED_FRAUD_RISK|LIKELY_LEGIT|SAFE_WITH_CAUTION/").first().textContent().catch(() => null);
report.historyRerunButtons = await page.locator("button", { hasText: "RE-RUN" }).count();

// BLOCK PAYEE (currently the FRAUD payee was analysed first; analyse it again then block)
await page.locator("button", { hasText: "LOAD & ANALYSE" }).first().click();
await page.waitForTimeout(1200);
await page.locator("button", { hasText: /^BLOCK PAYEE/ }).first().click();
await page.waitForTimeout(400);
report.blockedStore = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.includes("blocked"));
  return k ? { key: k, value: localStorage.getItem(k) } : null;
});
report.blockedListed = await page.locator("text=/refund-nodal09@icici/").count();
await page.screenshot({ path: `${OUT}/t4-qr-blocked.png` });

/* ---------------- F10 ENGINE ROOM ---------------- */
await nav("ENGINE ROOM");
await page.waitForTimeout(9000);

const pane = page.locator("section", { hasText: "ENGINE ROOM" }).first();
report.intakeTotalChip = await page.locator(".hud-chip", { hasText: "total" }).first().textContent().catch(() => null);

// drive a real burst through the backend (5+ complaints to one terminal in 30s)
await page.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    await fetch("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_terminal_id: "BLR-01",
        victim_vpa: "burst.test@icici",
        disputed_amount_inr: 49000,
        hop_count: 2,
        source: "WEB",
      }),
    });
    await new Promise((r) => setTimeout(r, 250));
  }
});
await page.waitForTimeout(3500);

const hook = page.locator("[data-er-intake]");
report.intakeBars = Number(await hook.getAttribute("data-er-intake"));
report.logEntries = Number(await hook.getAttribute("data-er-log"));
report.spikeRows = Number(await hook.getAttribute("data-er-spike"));
report.burstRows = Number(await hook.getAttribute("data-er-burst"));
report.rankingRows = await page.locator("b", { hasText: /^#\d$/ }).count();
report.chainChips = await page.locator(".hud-chip", { hasText: /×0.42\^/ }).count();
report.spikePills = await page.locator(".hud-chip", { hasText: /now \d/ }).count();
report.logCounter = await page.locator(".hud-chip", { hasText: "entries" }).first().textContent().catch(() => null);
report.logHasComplaint = await page.locator("text=/complaint [0-9]+ @/").count();
report.logHasBurst = await page.locator("text=/BURST at BLR-01/").count();

// prove the SMS branch of the log via a real /sms-plain POST (which broadcasts)
await page.evaluate(async () => {
  await fetch("/sms-plain", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "T4TEST|Your KYC will be blocked today, share OTP and click https://bit.ly/kyc",
  });
});
await page.waitForTimeout(2500);
report.logHasSms = await page.locator("text=/SMS SMS_[A-Z]+/").count();
await page.screenshot({ path: `${OUT}/t4-engine.png` });

report.errors = errors;
await browser.close();
console.log(JSON.stringify(report, null, 2));
