import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
const dir = process.argv[2];
const uri = (f) => "data:image/svg+xml;base64," + readFileSync(`${dir}/${f}.svg`).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(`${dir}/png`, { recursive: true });
const exports = [["icon", 16], ["icon", 32], ["icon", 48], ["icon", 192], ["icon", 512], ["apple", 180], ["maskable", 512]];
for (const [name, size] of exports) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${uri(name)}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: `${dir}/png/${name}-${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
// Preview sheet: tab sizes on light and dark, the iPhone tile, Android's circle crop, the in-app sizes.
await page.setViewportSize({ width: 980, height: 420 });
const tile = (f, s, extra = "") => `<img src="${uri(f)}" width="${s}" height="${s}" style="${extra}">`;
await page.setContent(`<html><body style="margin:0;font:13px system-ui;display:grid;grid-template-columns:1fr 1fr;height:420px">
  <div style="background:#fff;padding:24px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;gap:18px;align-items:end">${tile("icon",16)}${tile("icon",32)}${tile("icon",64)}${tile("icon",128)}</div>
    <div style="display:flex;gap:28px;align-items:center">${tile("apple",120,"border-radius:27px")}${tile("maskable",120,"border-radius:50%")}<span style="color:#6b6b78">iOS · Android</span></div>
  </div>
  <div style="background:#131317;padding:24px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;gap:18px;align-items:end">${tile("icon",16)}${tile("icon",32)}${tile("icon",64)}${tile("icon",128)}</div>
    <div style="display:flex;gap:28px;align-items:center">${tile("apple",120,"border-radius:27px")}${tile("maskable",120,"border-radius:50%")}</div>
  </div></body></html>`);
await page.waitForTimeout(200);
await page.screenshot({ path: `${dir}/preview.png` });
await browser.close();
console.log("rendered", exports.length, "PNGs + preview");
