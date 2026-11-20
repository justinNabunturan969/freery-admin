/**
 * Probe: turn Ferry 4 in service and watch what each layer reports.
 *
 *   node scripts/tmp-probe-toggle.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const ADMIN = "http://127.0.0.1:3001";
const LIVE_API = "http://127.0.0.1:4000";
const SITE = "http://127.0.0.1:3000";

function makeJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
    },
    absorb(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(";");
        const split = pair.indexOf("=");
        if (split === -1) continue;
        cookies.set(pair.slice(0, split).trim(), pair.slice(split + 1).trim());
      }
    },
  };
}

async function call(url, { jar, ...options } = {}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(url, { ...options, headers, redirect: "manual" });
  jar?.absorb(response);
  return response;
}

async function body(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const secrets = JSON.parse(readFileSync(join(repoRoot, ".secrets", "admin-login.json"), "utf8"));
const liveApiEnv = readFileSync(
  join(repoRoot, "apps", "readonly-api", ".env.local"),
  "utf8",
);
const apiSecret = liveApiEnv
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("API_SECRET="))
  ?.slice("API_SECRET=".length);

const jar = makeJar();
const csrf = await call(`${ADMIN}/api/auth/csrf`, { jar });
const { csrfToken } = await body(csrf);
const form = new URLSearchParams({
  csrfToken,
  username: secrets.username,
  password: secrets.password,
  callbackUrl: `${ADMIN}/`,
});
const signIn = await call(`${ADMIN}/api/auth/callback/credentials`, {
  jar,
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
console.log("sign in:", signIn.status, signIn.headers.get("location"));

const before = await body(await call(`${ADMIN}/api/admin/ferries`, { jar }));
console.log(
  "admin GET before:",
  before.ferries?.map((f) => `${f.id} ${f.name} inOperation=${f.inOperation} status=${f.status}`),
);

const patched = await call(`${ADMIN}/api/admin/ferries`, {
  jar,
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: 4, inOperation: true }),
});
console.log("PATCH inOperation=true ->", patched.status, await body(patched));

const after = await body(await call(`${ADMIN}/api/admin/ferries`, { jar }));
console.log(
  "admin GET after:",
  after.ferries?.map((f) => `${f.id} ${f.name} inOperation=${f.inOperation} status=${f.status}`),
);

const live = await fetch(`${LIVE_API}/ferries`, { headers: { "x-api-secret": apiSecret } });
const liveBody = await live.json();
console.log("read-only API:", live.status, liveBody.ferries?.map((f) => `${f.id} ${f.name} ${f.status}`));

await new Promise((resolve) => setTimeout(resolve, 4000));
const site = await fetch(`${SITE}/api/ferries`);
const siteBody = await site.json();
console.log("passenger site:", site.status, siteBody.ferries?.map((f) => `${f.id} ${f.name} ${f.status}`));
