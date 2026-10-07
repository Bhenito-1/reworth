#!/usr/bin/env node
/**
 * CITY_PLAYBOOK automation — validate required keys on config/regions/*.json
 * Usage: node scripts/validate-city-config.mjs [dir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_TOP = [
  'city',
  'displayName',
  'timezone',
  'communities',
  'geocoding',
  'logistics',
  'priceBands',
  'psp',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const dir = resolve(
  process.argv[2] ??
    process.env.REGION_CONFIG_DIR ??
    join(repoRoot, 'config', 'regions'),
);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function validateFile(filePath, name) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    fail(`${name}: invalid JSON — ${e.message}`);
    return;
  }

  for (const key of REQUIRED_TOP) {
    if (raw[key] === undefined || raw[key] === null) {
      fail(`${name}: missing required key "${key}"`);
    }
  }

  if (typeof raw.city !== 'string' || !raw.city.trim()) {
    fail(`${name}: city must be non-empty string`);
  }
  if (typeof raw.displayName !== 'string' || !raw.displayName.trim()) {
    fail(`${name}: displayName must be non-empty string`);
  }
  if (raw.timezone !== 'Africa/Lagos') {
    fail(`${name}: timezone must be Africa/Lagos (WAT)`);
  }
  if (!Array.isArray(raw.communities) || raw.communities.length === 0) {
    fail(`${name}: communities must be a non-empty array`);
  }
  if (!raw.geocoding || typeof raw.geocoding !== 'object') {
    fail(`${name}: geocoding must be an object`);
  } else {
    for (const c of raw.communities ?? []) {
      const g = raw.geocoding[c];
      if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') {
        fail(`${name}: geocoding missing lat/lng for community "${c}"`);
      }
    }
  }
  if (
    !raw.logistics ||
    typeof raw.logistics.baseFeeKobo !== 'number' ||
    typeof raw.logistics.perKmKobo !== 'number'
  ) {
    fail(`${name}: logistics.baseFeeKobo and perKmKobo required`);
  }
  if (!raw.priceBands || typeof raw.priceBands !== 'object') {
    fail(`${name}: priceBands must be an object`);
  }
  if (!raw.psp || typeof raw.psp.enabled !== 'boolean') {
    fail(`${name}: psp.enabled boolean required`);
  }

  if (!process.exitCode) {
    console.log(`✓ ${name} (${raw.displayName})`);
  }
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  fail(`No JSON files in ${dir}`);
  process.exit(1);
}

console.log(`Validating ${files.length} region file(s) in ${dir}`);
for (const f of files) {
  validateFile(join(dir, f), f);
}

if (process.exitCode) {
  console.error('City config validation failed');
  process.exit(1);
}
console.log('All city configs valid');
