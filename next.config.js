const fs = require("node:fs");

/**
 * The admin app runs in two modes from one codebase.
 *
 * The mode decides which environment file is the real one. scripts/run.mjs
 * points FREERY_ENV_FILE at it, and the values are read again here so the
 * mode file always wins over the .env.local that Next.js loads by itself.
 * Without this the counter process would quietly use the admin database
 * role, which is exactly what the separation is meant to prevent.
 */
if (process.env.FREERY_ENV_FILE && fs.existsSync(process.env.FREERY_ENV_FILE)) {
  const body = fs.readFileSync(process.env.FREERY_ENV_FILE, "utf8");
  for (const rawLine of body.split(/\r?\n/)) {
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
    process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repository root holds its own lock file, so Next.js would guess the
  // wrong root for the file tracing and the build. This app is the root.
  outputFileTracingRoot: __dirname,
  // The shared package is TypeScript source and it sits inside this app
  // folder now, so it is compiled together with the app.
};

module.exports = nextConfig;
