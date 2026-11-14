// Draws the app icon: a white house-shaped speech bubble (a home for the family, a bubble for chat)
// with three typing dots, on the accent orange. Writes icon.svg (rounded tile, browser tabs and
// "any" PNGs), apple.svg (full square; iOS rounds it) and maskable.svg (shape inside Android's 80%
// safe circle) into the folder given. src/components/logo.tsx inlines the same HOUSE and DOTS.
import { writeFileSync } from "node:fs";

const ACCENT = "#ff5500";
const WHITE = "#ffffff";
// Roof, walls and a tail at the bottom left; the round stroke softens every corner.
const HOUSE = "M512 195L800 435V725H450L292 845L330 725H224V435Z";
const DOTS = [392, 512, 632].map((cx) => ({ cx, cy: 565, r: 46 }));

function svg({ rounded, scale }) {
  const shape =
    `<path d="${HOUSE}" fill="${WHITE}" stroke="${WHITE}" stroke-width="56" stroke-linejoin="round"/>` +
    DOTS.map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${ACCENT}"/>`).join("");
  const body = scale === 1 ? shape : `<g transform="translate(512 520) scale(${scale}) translate(-512 -520)">${shape}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024"${rounded ? ' rx="232"' : ""} fill="${ACCENT}"/>${body}</svg>\n`
  );
}

const out = process.argv[2];
writeFileSync(`${out}/icon.svg`, svg({ rounded: true, scale: 1 }));
writeFileSync(`${out}/apple.svg`, svg({ rounded: false, scale: 1 }));
writeFileSync(`${out}/maskable.svg`, svg({ rounded: false, scale: 0.84 }));
console.log("drew icon.svg, apple.svg, maskable.svg");
