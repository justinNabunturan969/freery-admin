/**
 * The head station PC's own network.
 *
 * The board at the head station has to be on the same network as this PC, so
 * that the board can reach it. That makes the PC's own network the first
 * answer when somebody asks the console to give the board a network: it is
 * the network the PC is on right now.
 *
 * So the console reads it from Windows:
 *
 *   - `netsh wlan show interfaces` says which network the PC is on, how good
 *     the signal is, and what the adapter is called.
 *   - Node's own `os.networkInterfaces()` says what address the PC has on that
 *     adapter.
 *   - `netsh wlan export profile` says the password, when Windows has it
 *     saved. The password is read as an XML file, because the element names in
 *     that file are the same in every language, while the labels `netsh` prints
 *     are translated.
 *
 * **The password never leaves this module.** It is not sent to the browser and
 * it is not printed. It goes straight into the request the console makes for
 * the board, which hands it over once and then clears it.
 *
 * Windows only. On anything else the console simply says it does not know.
 */

import { execFile } from "node:child_process";
import { networkInterfaces, tmpdir } from "node:os";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface PcNetwork {
  /** The name of the network this PC is on, as the router calls it. */
  ssid: string | null;
  /** The address of this PC on that network. */
  ip: string | null;
  /** The name of the adapter, as Windows calls it. */
  adapter: string | null;
  /** How good the signal is, as Windows reports it, for example "92%". */
  signal: string | null;
  /**
   * True when Windows has the password for this network saved, so that it does
   * not have to be typed in.
   */
  passwordSaved: boolean;
}

/**
 * A network the PC can see.
 *
 * This is every network in range, not only the one the PC is on. The board at
 * the head station can be put on any of them, so the console offers all of
 * them.
 */
export interface NearbyNetwork {
  /** The name of the network, as the router calls it. */
  ssid: string;
  /** How good the signal is, for example "92%". */
  signal: string | null;
  /**
   * The band the network is on, for example "2.4 GHz". The board's Wi-Fi is
   * 2.4 GHz only, so a 5 GHz network cannot be used.
   */
  band: string | null;
  /** How the network is protected, for example "WPA2-Personal". */
  security: string | null;
  /**
   * True when Windows has the password for this network saved, so that it does
   * not have to be typed in.
   */
  passwordSaved: boolean;
  /** True for the network the PC is on right now. */
  connected: boolean;
}

/**
 * One network, as it was found in the scan, before it is matched against the
 * saved profiles.
 */
export interface ScannedNetwork {
  ssid: string;
  signal: string | null;
  band: string | null;
  security: string | null;
}

/** One interface, as `netsh wlan show interfaces` describes it. */
interface InterfaceBlock {
  name: string;
  state: string;
  ssid: string;
  signal: string;
}

/**
 * How long a read of the network is kept.
 *
 * The console asks for it once when the card opens and then now and then, so
 * there is no need to run `netsh` every few seconds.
 */
const CACHE_MS = 20_000;

/**
 * How long a scan of the nearby networks is kept.
 *
 * A scan makes Windows look for the networks around it. Asking again too soon
 * keeps the adapter busy, and an adapter that is kept busy never finishes a
 * scan, so the answer stays short. The answer is therefore kept for a full
 * minute, and a fresh scan is not done more often than this.
 */
const SCAN_CACHE_MS = 60_000;

/** The shortest time between two real scans. */
const SCAN_MIN_GAP_MS = 15_000;

/**
 * How long the scan is given to finish.
 *
 * Asking Windows for the networks starts a scan. A request made before that
 * scan has finished answers with **only the network this PC is on**, so the
 * results are read again after a moment.
 */
const SCAN_SETTLE_MS = 5000;

/**
 * How many times the scan is tried.
 *
 * A machine that has just been woken up, or an adapter that has just been
 * used, can answer with only the network this PC is on for a while. One
 * network on its own is the sign of a scan that has not really finished, so the
 * scan is tried again. The try stops as soon as a real list comes back, so the
 * usual case is one try.
 */
const SCAN_ATTEMPTS = 2;

/** Fewer networks than this means the scan has not really finished. */
const SCAN_MINIMUM = 2;

let cached: { at: number; network: PcNetwork } | null = null;

/** The password of a saved profile, kept for a short while. */
let cachedPassword: { at: number; ssid: string; password: string } | null = null;

/** The networks that were in range, kept for a short while. */
let cachedScan: { at: number; networks: NearbyNetwork[] } | null = null;

/**
 * Reads the network this PC is on.
 *
 * Returns null when Windows cannot say, for example when the PC is on a cable
 * rather than on Wi-Fi.
 */
export async function readPcNetwork(): Promise<PcNetwork | null> {
  if (process.platform !== "win32") return null;

  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.network;

  const blocks = await listInterfaces();
  const chosen = pickConnected(blocks);

  if (!chosen) {
    const empty: PcNetwork = {
      ssid: null,
      ip: null,
      adapter: null,
      signal: null,
      passwordSaved: false,
    };
    cached = { at: now, network: empty };
    return empty;
  }

  const password = await readSavedPassword(chosen.ssid);
  const network: PcNetwork = {
    ssid: chosen.ssid,
    ip: addressFor(chosen.name),
    adapter: chosen.name,
    signal: chosen.signal || null,
    passwordSaved: password !== null,
  };

  cached = { at: now, network };
  return network;
}

/**
 * The password of a network this PC has saved.
 *
 * Returns null when Windows has no profile for that network, or when the
 * profile cannot be read. An empty string means the network is open, which is
 * a different thing from "not known".
 */
export async function savedPasswordFor(ssid: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  if (!ssid) return null;

  const now = Date.now();
  if (cachedPassword && now - cachedPassword.at < CACHE_MS && cachedPassword.ssid === ssid) {
    return cachedPassword.password;
  }

  const password = await readSavedPassword(ssid);
  if (password === null) return null;

  cachedPassword = { at: now, ssid, password };
  return password;
}

/** Runs `netsh wlan show interfaces` and reads the blocks it prints. */
async function listInterfaces(): Promise<InterfaceBlock[]> {
  let output = "";
  try {
    const result = await run("netsh", ["wlan", "show", "interfaces"], {
      windowsHide: true,
      timeout: 10_000,
    });
    output = result.stdout ?? "";
  } catch {
    /* The command can fail when there is no Wi-Fi at all, or when it needs a
       window of its own. Either way there is nothing to report. */
    return [];
  }
  return parseInterfaces(output);
}

/**
 * Reads the blocks out of the `netsh` output.
 *
 * Every line is a label and a value, and a new interface starts at every line
 * whose label is "Name".
 */
export function parseInterfaces(output: string): InterfaceBlock[] {
  const blocks: InterfaceBlock[] = [];
  let current: InterfaceBlock | null = null;

  for (const raw of output.split(/\r?\n/)) {
    const match = raw.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (!match) continue;

    const label = (match[1] ?? "").trim().toLowerCase();
    const value = (match[2] ?? "").trim();

    if (label === "name") {
      current = { name: value, state: "", ssid: "", signal: "" };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    if (label === "state") current.state = value.toLowerCase();
    else if (label === "ssid") current.ssid = value;
    else if (label === "signal") current.signal = value;
  }

  return blocks;
}

/**
 * Picks the interface that is on a network.
 *
 * The one that says it is connected is the right one. When Windows is in
 * another language the word is different, so the first one with a network on
 * it is used instead.
 */
export function pickConnected(blocks: InterfaceBlock[]): InterfaceBlock | null {
  const withNetwork = blocks.filter((block) => block.ssid.length > 0);
  if (withNetwork.length === 0) return null;
  return withNetwork.find((block) => block.state.includes("connect")) ?? withNetwork[0] ?? null;
}

/** The address of this PC on the given adapter. */
function addressFor(adapter: string): string | null {
  const all = networkInterfaces();

  const onAdapter = all[adapter]?.find(
    (address) => address.family === "IPv4" && !address.internal,
  );
  if (onAdapter) return onAdapter.address;

  /* The adapter name from netsh is not always the name Node uses, so any
     address on the machine is better than none. */
  for (const list of Object.values(all)) {
    const found = list?.find((address) => address.family === "IPv4" && !address.internal);
    if (found) return found.address;
  }

  return null;
}

/**
 * Reads the password of a saved profile.
 *
 * The profile is written to a folder of its own and read back, because the XML
 * it is written as uses the same element names in every language. The folder is
 * taken away again straight away, and the file only ever holds the password
 * for a few milliseconds.
 */
async function readSavedPassword(ssid: string): Promise<string | null> {
  if (!ssid) return null;

  let folder: string | null = null;
  try {
    folder = await mkdtemp(join(tmpdir(), "freery-wlan-"));
    await run(
      "netsh",
      ["wlan", "export", "profile", `name=${ssid}`, "key=clear", `folder=${folder}`],
      { windowsHide: true, timeout: 15_000 },
    );

    const names = await readdir(folder);
    const file = names.find((name) => name.toLowerCase().endsWith(".xml"));
    if (!file) return null;

    const xml = await readFile(join(folder, file), "utf8");
    const match = xml.match(/<keyMaterial>([\s\S]*?)<\/keyMaterial>/);
    if (!match) return null;

    return match[1] ?? "";
  } catch {
    /* Windows will not give the password away when the profile is not saved,
       or when the process is not allowed to read it. */
    return null;
  } finally {
    if (folder) {
      await rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Runs a `netsh` command and gives back what it printed.
 *
 * `netsh` sometimes ends with an odd exit code even when it worked, so the
 * output is used whatever the code was. Only a real failure gives nothing.
 */
async function netsh(args: string[]): Promise<string> {
  try {
    const result = await run("netsh", args, { windowsHide: true, timeout: 20_000 });
    return result.stdout ?? "";
  } catch (error) {
    /* The output is still there when netsh failed at the very end. */
    const partial = (error as { stdout?: string } | undefined)?.stdout;
    if (typeof partial === "string" && partial.trim().length > 0) return partial;
    return "";
  }
}

/**
 * Reads the networks that are in range.
 *
 * `netsh wlan show networks mode=bssid` lists every network the adapter can
 * see, with the signal, the band and the protection of each one.
 *
 * **The labels are translated**, so the parser does not read the labels. It
 * reads the shape of the text instead:
 *
 *   - a network starts at a line with no indent, and its name is what follows
 *     the last colon on that line;
 *   - the signal is the only value that is a plain percentage;
 *   - the band is the only value that ends in "GHz".
 *
 * A hidden network has no name, and cannot be joined by name, so it is left
 * out.
 */
export function parseNetworks(output: string): ScannedNetwork[] {
  const networks: ScannedNetwork[] = [];
  let current: ScannedNetwork | null = null;

  for (const raw of output.split(/\r?\n/)) {
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (indent === 0) {
      const header = line.match(/^.*?\s+(\d+)\s*:\s*(.*)$/);
      const ssid = header ? (header[2] ?? "").trim() : "";
      if (!ssid) {
        current = null;
        continue;
      }
      current = { ssid, signal: null, band: null, security: null };
      networks.push(current);
      continue;
    }

    if (!current) continue;

    /* The value after the first colon. */
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const value = line.slice(colon + 1).trim();

    const percent = value.match(/^(\d+)\s*%$/);
    if (percent) {
      const strength = Number(percent[1]);
      const best = current.signal ? Number(current.signal.replace("%", "")) : -1;
      if (strength > best) current.signal = `${strength}%`;
      continue;
    }

    const band = value.match(/^(\d+(?:\.\d+)?)\s*GHz$/i);
    if (band) {
      /* One network can be seen on both bands. The board can only use 2.4 GHz,
         so the lower band is the one that matters. */
      if (!current.band) current.band = value;
      else if (!current.band.includes(band[1] ?? "")) {
        current.band = `${current.band} and ${value}`;
      }
      continue;
    }

    const security = value.match(/^(WPA\d?(?:-Personal|-Enterprise)?|WEP|Open|None|RSA|IEEE\s?\d*\.?\d*)/i);
    if (security && !current.security) current.security = security[1] ?? null;
  }

  return networks;
}

/**
 * Reads the names of the networks Windows has saved.
 *
 * `netsh wlan show profiles` lists them one per line, indented, with the name
 * after the first colon. The words before the colon are translated, so only
 * the name is used.
 */
export function parseProfileNames(output: string): string[] {
  const names: string[] = [];

  for (const raw of output.split(/\r?\n/)) {
    /* The entries are indented. The headings are not. */
    if (!/^\s{4,}\S/.test(raw)) continue;

    const line = raw.trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const name = line.slice(colon + 1).trim();
    if (name && name !== "<None>") names.push(name);
  }

  return names;
}

/**
 * Lists the networks that are in range.
 *
 * The network the PC is on is marked, and each one says whether Windows has
 * its password saved, so the console knows which ones can be given to the
 * board without anything being typed.
 *
 * The scan takes about four seconds, because the results are read twice, and
 * it makes Windows look for the networks around it, so the answer is kept for
 * half a minute. Pass `fresh` to look again straight away.
 */
export async function listNearbyNetworks(
  current?: string | null,
  options: { fresh?: boolean } = {},
): Promise<NearbyNetwork[]> {
  if (process.platform !== "win32") return [];

  const now = Date.now();
  const age = cachedScan ? now - cachedScan.at : Number.POSITIVE_INFINITY;

  /* The answer is kept, and even a fresh request does not scan again straight
     away. An adapter that is asked too often never finishes a scan, and then
     the list is short and stays short. */
  if (cachedScan && age < SCAN_MIN_GAP_MS) {
    return markConnected(cachedScan.networks, current ?? null);
  }
  if (cachedScan && !options.fresh && age < SCAN_CACHE_MS) {
    return markConnected(cachedScan.networks, current ?? null);
  }

  const [scan, profiles] = await Promise.all([
    settledScan(),
    netsh(["wlan", "show", "profiles"]),
  ]);

  const saved = new Set(parseProfileNames(profiles));
  const found = mergeNetworks(parseNetworks(scan)).map((network) => ({
    ...network,
    passwordSaved: saved.has(network.ssid),
    connected: false,
  }));

  /*
   * A scan that was caught in the middle only finds the network this PC is on.
   * A short answer is never allowed to replace a longer one that is already
   * known, because the long one is the true picture.
   */
  const previous = cachedScan?.networks ?? [];
  const networks = found.length >= previous.length ? found : previous;

  cachedScan = { at: now, networks };
  return markConnected(networks, current ?? null);
}

/**
 * Reads the networks that are in range, once the scan has finished.
 *
 * The first request starts the scan. The scan needs a moment, and then the
 * results are there, so the request is made a second time. When the answer
 * still holds only the network this PC is on, the scan has not really finished
 * and it is tried once more.
 *
 * The **longest** answer is the one that is kept. A scan that was caught in
 * the middle finds fewer networks, never more.
 */
async function settledScan(): Promise<string> {
  let best = "";
  let bestCount = 0;

  for (let attempt = 0; attempt < SCAN_ATTEMPTS; attempt += 1) {
    await netsh(["wlan", "show", "networks", "mode=bssid"]);
    await new Promise((resolve) => setTimeout(resolve, SCAN_SETTLE_MS));

    const output = await netsh(["wlan", "show", "networks", "mode=bssid"]);
    const count = parseNetworks(output).length;
    if (count > bestCount) {
      best = output;
      bestCount = count;
    }

    if (bestCount >= SCAN_MINIMUM) return best;
  }

  return best;
}

/** Puts the networks with the same name together. */
function mergeNetworks(networks: ScannedNetwork[]): ScannedNetwork[] {
  const merged = new Map<string, ScannedNetwork>();

  for (const network of networks) {
    const existing = merged.get(network.ssid);
    if (!existing) {
      merged.set(network.ssid, { ...network });
      continue;
    }

    const best = existing.signal ? Number(existing.signal.replace("%", "")) : -1;
    const strength = network.signal ? Number(network.signal.replace("%", "")) : -1;
    if (strength > best) existing.signal = network.signal;

    if (network.band && !existing.band) existing.band = network.band;
    else if (network.band && existing.band && !existing.band.includes(network.band)) {
      existing.band = `${existing.band} and ${network.band}`;
    }

    if (network.security && !existing.security) existing.security = network.security;
  }

  return [...merged.values()].sort(
    (a, b) =>
      Number(b.signal?.replace("%", "") ?? -1) - Number(a.signal?.replace("%", "") ?? -1),
  );
}

/** Marks the network the PC is on, and puts it first. */
function markConnected(networks: NearbyNetwork[], current: string | null): NearbyNetwork[] {
  const marked = networks.map((network) => ({
    ...network,
    connected: current !== null && network.ssid === current,
  }));

  return [...marked].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (
      Number(b.signal?.replace("%", "") ?? -1) - Number(a.signal?.replace("%", "") ?? -1)
    );
  });
}
