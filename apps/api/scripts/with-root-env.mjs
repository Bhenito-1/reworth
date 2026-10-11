/**
 * Load monorepo root `.env` into process.env, mirror it to `apps/api/.env`
 * (Prisma CLI only auto-loads cwd / prisma/), then run the given command.
 *
 * Usage: node scripts/with-root-env.mjs prisma migrate deploy
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');
const monorepoRoot = resolve(apiRoot, '../..');
const rootEnv = resolve(monorepoRoot, '.env');
const apiEnv = resolve(apiRoot, '.env');

/** Known package CLI entrypoints — run via node to avoid Windows .cmd EINVAL. */
const NODE_BIN_ENTRIES = {
  prisma: ['prisma/build/index.js'],
};

function loadEnvFile(file) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

/**
 * @returns {{ file: string, args: string[], shell: boolean }}
 */
function resolveSpawn(command, commandArgs) {
  if (command.includes('/') || command.includes('\\') || command.endsWith('.js')) {
    return { file: command, args: commandArgs, shell: false };
  }

  const jsRels = NODE_BIN_ENTRIES[command];
  if (jsRels) {
    for (const root of [apiRoot, monorepoRoot]) {
      for (const rel of jsRels) {
        const candidate = resolve(root, 'node_modules', rel);
        if (existsSync(candidate)) {
          return {
            file: process.execPath,
            args: [candidate, ...commandArgs],
            shell: false,
          };
        }
      }
    }
  }

  const binNames =
    process.platform === 'win32'
      ? [`${command}.cmd`, `${command}.ps1`, command]
      : [command];
  for (const name of binNames) {
    for (const root of [apiRoot, monorepoRoot]) {
      const candidate = resolve(root, 'node_modules', '.bin', name);
      if (!existsSync(candidate)) continue;
      // Windows .cmd/.bat cannot be spawned with shell:false (EINVAL).
      const needsShell =
        process.platform === 'win32' &&
        (/\.cmd$/i.test(candidate) || /\.bat$/i.test(candidate));
      return {
        file: candidate,
        args: commandArgs,
        shell: needsShell,
      };
    }
  }

  return { file: command, args: commandArgs, shell: false };
}

if (loadEnvFile(rootEnv)) {
  try {
    copyFileSync(rootEnv, apiEnv);
  } catch (err) {
    console.warn(`[with-root-env] Could not mirror .env to apps/api: ${err.message}`);
  }
} else if (!process.env.DATABASE_URL) {
  console.error(
    `[with-root-env] Missing ${rootEnv}\nCopy .env.example → .env at the monorepo root (reworth/).`,
  );
  process.exit(1);
} else {
  console.log(
    '[with-root-env] No root .env file; using environment variables already set.',
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/with-root-env.mjs <command> [...args]');
  process.exit(1);
}

const [command, ...commandArgs] = args;
const spawn = resolveSpawn(command, commandArgs);
const result = spawnSync(spawn.file, spawn.args, {
  cwd: apiRoot,
  env: process.env,
  stdio: 'inherit',
  shell: spawn.shell,
});

if (result.error) {
  console.error(
    `[with-root-env] Failed to run ${command}: ${result.error.message}`,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
