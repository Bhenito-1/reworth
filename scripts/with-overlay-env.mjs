#!/usr/bin/env node
/**
 * Run a command with the local .env, then let .env.<name> override it.
 * `pnpm dev` does not use this script and keeps the Docker-backed .env.
 *
 * Usage: node scripts/with-overlay-env.mjs <staging|production> <command> [...args]
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = new Set(['staging', 'production']);

function loadEnvFile(file, override) {
  if (!existsSync(file)) return false;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

const [name, ...args] = process.argv.slice(2);
if (!NAMES.has(name) || args.length === 0) {
  console.error(
    'Usage: node scripts/with-overlay-env.mjs <staging|production> <command> [...args]',
  );
  process.exit(1);
}

const overlayFile = resolve(root, `.env.${name}`);
if (!existsSync(overlayFile)) {
  console.error(
    `Missing .env.${name}. Copy .env.${name}.example to .env.${name} and fill in the ${name} values.`,
  );
  process.exit(1);
}

loadEnvFile(resolve(root, '.env'), false);
loadEnvFile(overlayFile, true);

const [command, ...commandArgs] = args;
const localBin = resolve(root, 'node_modules', '.bin', command);
const file = existsSync(localBin) ? localBin : command;

console.log(`[${name}] .env.${name} overrides .env for this process`);

const child = spawn(file, commandArgs, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error(`[${name}] Failed to run ${command}: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
