#!/usr/bin/env node
/**
 * Fail if hardcoded hex colours appear in design-system paths.
 * Full-app screen migration tracked in docs/DESIGN.md checklist.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ALLOW = [
  /tokens\.ts$/,
  /tokens\.css$/,
  /haptics\.ts$/,
];

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const WHITE_BLACK = new Set([
  "#fff",
  "#FFF",
  "#ffffff",
  "#FFFFFF",
  "#000",
  "#000000",
]);

function listed() {
  const out = execSync(
    'git ls-files "apps/mobile/components/**/*.{ts,tsx}" "apps/mobile/theme/**/*.{ts,tsx}" "packages/ui-web/src/components/**/*.{ts,tsx}"',
    { encoding: "utf8" },
  );
  return out.split(/\r?\n/).filter(Boolean);
}

const offenders = [];
for (const file of listed()) {
  if (ALLOW.some((re) => re.test(file))) continue;
  const text = readFileSync(file, "utf8");
  const matches = (text.match(HEX) || []).filter((h) => !WHITE_BLACK.has(h));
  if (matches.length) {
    offenders.push({ file, samples: [...new Set(matches)].slice(0, 8) });
  }
}

if (offenders.length) {
  console.error("hex-audit: hardcoded colours outside token files:");
  for (const o of offenders) {
    console.error(`  ${o.file}: ${o.samples.join(", ")}`);
  }
  process.exit(1);
}

console.log("hex-audit: ok (design-system paths)");
