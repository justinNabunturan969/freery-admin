/**
 * Starts Next.js with one specific environment file.
 *
 *   node scripts/run.mjs .env.local          next dev --port 3001
 *   node scripts/run.mjs .env.counter.local  next dev --port 3002
 *
 * Next.js only loads .env.local by itself, and both modes run on the same
 * computer, so the counter process would otherwise pick up the admin
 * database role. This script loads the right file into the environment
 * before Next.js starts, and points next.config.js at the same file so the
 * two always agree.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const [, , envFileArg, ...rest] = process.argv;

if (!envFileArg || rest.length === 0) {
  console.error(
    "Usage: node scripts/run.mjs <env-file> <next command> [arguments...]",
  );
  process.exit(1);
}

// The caller may write "next build" or just "build". Both work.
const nextArgs = rest[0] === "next" ? rest.slice(1) : rest;

if (nextArgs.length === 0) {
  console.error(
    "Usage: node scripts/run.mjs <env-file> <next command> [arguments...]",
  );
  process.exit(1);
}

const envFile = resolve(appRoot, envFileArg);

if (!existsSync(envFile)) {
  console.error(`The environment file ${envFile} does not exist.`);
  process.exit(1);
}

const env = { ...process.env };

for (const rawLine of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const split = line.indexOf("=");
  if (split === -1) continue;

  const key = line.slice(0, split).trim();
  let value = line.slice(split + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

// The name is unique on purpose. Nothing in an env file can overwrite it,
// so next.config.js always knows which file is the real one.
env.FREERY_ENV_FILE = envFile;

const nextBin = join(appRoot, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
