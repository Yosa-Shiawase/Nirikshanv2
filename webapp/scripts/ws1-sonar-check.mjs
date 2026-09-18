// Sonar acceptance: effect-alone + text-overlay shots, numeric contrast checks.
import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("shots", { recursive: true });
const URL = "http://localhost:4173/404.html";

const lum = (hex) => {
  const n = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const ratio = (a, b) => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};

async function run(width, label) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message ? e.message : String(e))));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(2600);

  const rects = await page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
    const cs = getComputedStyle(document.querySelector("h1"));
    const btn = document.querySelector(".cta");
    const bcs = getComputedStyle(btn);
    return {
      h1: g("h1"),
      cta: g(".cta"),
      h1Color: cs.color,
      btnColor: bcs.color,
      btnBg: bcs.backgroundColor,
    };
  });

  // with text overlay
  await page.screenshot({ path: `shots/ws1-sonar-${label}-text.png` });

  // effect alone
  await page.evaluate(() => { document.querySelector("main").style.visibility = "hidden"; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/ws1-sonar-${label}-effect.png` });

  // sample the brightest background pixel behind the headline (text hidden)
  const clip = rects.h1 ? { x: Math.max(0, rects.h1.x - 10), y: Math.max(0, rects.h1.y - 6), width: rects.h1.width + 20, height: rects.h1.height + 12 } : null;
  let headlineBgLum = null;
  let brightPixels = 0;
  if (clip) {
    const buf = await page.screenshot({ clip });
    const b64 = buf.toString("base64");
    const res = await page.evaluate(async (payload) => {
      const img = new Image();
      img.src = "data:image/png;base64," + payload;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      let maxL = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
        if (L > maxL) maxL = L;
        if (L > 0.2) bright++;
      }
      return { maxL, bright };
    }, b64);
    headlineBgLum = res.maxL;
    brightPixels = res.bright;
  }

  // whole-frame brightness (effect alone) to confirm the sonar is actually drawn
  const fullBuf = await page.screenshot();
  const full = await page.evaluate(async (payload) => {
    const img = new Image();
    img.src = "data:image/png;base64," + payload;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let bright = 0, cyanish = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      if (L > 0.25) bright++;
      if (d[i + 2] > 90 && d[i + 2] > d[i] * 1.4) cyanish++;
    }
    return { bright, cyanish, total: d.length / 4 };
  }, fullBuf.toString("base64"));

  await ctx.close();
  const h1Lum = lum(rects.h1Color.startsWith("rgb") ? rgbToHex(rects.h1Color) : "#dbe9f5");
  const btnLum = lum(rects.btnColor.startsWith("rgb") ? rgbToHex(rects.btnColor) : "#040813");
  const btnBgLum = lum(rects.btnBg.startsWith("rgb") ? rgbToHex(rects.btnBg) : "#53c7f0");
  return {
    width,
    textColors: { h1: rects.h1Color, btn: rects.btnColor, btnBg: rects.btnBg },
    headlineBgMaxLum: headlineBgLum,
    headlineContrast: headlineBgLum == null ? null : Number(ratio(headlineBgLum, h1Lum).toFixed(2)),
    buttonContrast: Number(ratio(btnLum, btnBgLum).toFixed(2)),
    effectBrightPixels: full.bright,
    effectCyanishPixels: full.cyanish,
    effectPixels: full.total,
    errors,
  };
}

function rgbToHex(s) {
  const m = s.match(/\d+/g);
  if (!m) return s;
  return "#" + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

out.desktop = await run(1440, "1440");
out.mobile = await run(390, "390");
await browser.close();
console.log(JSON.stringify(out, null, 2));
