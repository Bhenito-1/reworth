#!/usr/bin/env node
/**
 * Run a command with the local .env, then let .env.staging override it.
 * `pnpm dev` does not use this script and keeps the Docker-backed .env.
 *
 * Usage: node scripts/with-staging-env.mjs <command> [...args]
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

const stagingFile = resolve(root, '.env.staging');
if (!existsSync(stagingFile)) {
  console.error(
    'Missing .env.staging. Copy .env.staging.example to .env.staging and fill in the staging values.',
  );
  process.exit(1);
}

loadEnvFile(resolve(root, '.env'), false);
loadEnvFile(stagingFile, true);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/with-staging-env.mjs <command> [...args]');
  process.exit(1);
}

const [command, ...commandArgs] = args;
const localBin = resolve(root, 'node_modules', '.bin', command);
const file = existsSync(localBin) ? localBin : command;

console.log('[staging] .env.staging overrides .env for this process');

const child = spawn(file, commandArgs, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error(`[staging] Failed to run ${command}: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
