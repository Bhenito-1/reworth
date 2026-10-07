#!/usr/bin/env node
/**
 * Contrast audit — token pairs must meet WCAG AA.
 * Normal text ≥ 4.5:1; large/bold CTA label ≥ 3:1.
 * Usage: node scripts/contrast-audit.mjs
 */
const pairs = [
  { name: "navy on soft white", fg: "#172A3A", bg: "#FCFAF6", min: 4.5 },
  { name: "slate on soft white", fg: "#59636D", bg: "#FCFAF6", min: 4.5 },
  { name: "navy on surface", fg: "#172A3A", bg: "#FFFFFF", min: 4.5 },
  { name: "navy on beige", fg: "#172A3A", bg: "#F2E7D5", min: 4.5 },
  { name: "white on orange (CTA large)", fg: "#FFFFFF", bg: "#D96A32", min: 3 },
  { name: "white on navy (secondary CTA)", fg: "#FFFFFF", bg: "#172A3A", min: 3 },
  { name: "dark ink on navy canvas", fg: "#FCFAF6", bg: "#172A3A", min: 4.5 },
  { name: "dark muted on navy canvas", fg: "#CFD4D7", bg: "#172A3A", min: 4.5 },
  {
    name: "white on dark orange (CTA large)",
    fg: "#FFFFFF",
    bg: "#D96A32",
    min: 3,
  },
];

function lum(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

let failed = 0;
for (const { name, fg, bg, min } of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: ${r.toFixed(2)}:1 (min ${min})`,
  );
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} pair(s) below target`);
  process.exit(1);
}
console.log("\nAll token pairs meet targets");
