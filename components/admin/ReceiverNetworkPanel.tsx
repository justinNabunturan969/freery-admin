"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Field, Footnote, Input } from "@/components/ui/primitives";

export interface ReceiverCommand {
  id: number;
  ssid: string;
  status: "pending" | "delivered" | "connected" | "failed" | "cancelled";
  message: string | null;
  createdAt: string;
  deliveredAt: string | null;
  answeredAt: string | null;
}

export interface ReceiverRow {
  stationId: string;
  wifiSsid: string | null;
  wifiStatus: string | null;
  wifiIp: string | null;
  lastSeenAt: string | null;
  command: ReceiverCommand | null;
}

/** The network the head station PC is on. */
export interface PcNetwork {
  ssid: string | null;
  ip: string | null;
  adapter: string | null;
  signal: string | null;
  /** True when Windows has the password saved, so it need not be typed. */
  passwordSaved: boolean;
}

/** A network that is in range. */
export interface NearbyNetwork {
  ssid: string;
  signal: string | null;
  band: string | null;
  security: string | null;
  /** True when Windows has the password saved, so it need not be typed. */
  passwordSaved: boolean;
  /** True for the network the PC is on right now. */
  connected: boolean;
}

/** How the board's own network is described on the console. */
function boardState(receiver: ReceiverRow): string {
  if (receiver.wifiStatus === "setup") {
    return "Waiting for someone to set its network";
  }
  if (receiver.wifiStatus === "failed") {
    /*
     * The board keeps the network it already had when the new one does not
     * work, so the console says which network it is still on. When it has no
     * network at all, it puts up its own setup page, and the console says so,
     * because that page is the way back.
     */
    return receiver.wifiSsid
      ? `Could not get on the network it was given. It is still on ${receiver.wifiSsid}.`
      : "Could not get on the network it was given. It is putting up its own setup page.";
  }
  if (receiver.wifiStatus === "connected") {
    return receiver.wifiSsid
      ? `On ${receiver.wifiSsid}${receiver.wifiIp ? ` (${receiver.wifiIp})` : ""}`
      : "On a network";
  }
  return "No network reported yet";
}

/** How a request is described on the console. */
function commandState(command: ReceiverCommand): { tone: "info" | "good" | "bad" | "warn"; text: string } {
  switch (command.status) {
    case "pending":
      return { tone: "info", text: "Waiting for the board to ask for it." };
    case "delivered":
      return { tone: "warn", text: "The board has it. It is trying the network now." };
    case "connected":
      return { tone: "good", text: "The board is on that network." };
    case "failed":
      return { tone: "bad", text: command.message ?? "The board could not get on that network." };
    default:
      return { tone: "info", text: "The request was taken back." };
  }
}

function timeAgo(value: string | null): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The network this PC is on.
 *
 * The board at the head station belongs on the same network as the PC, so this
 * is the first answer when somebody asks for a network for the board. The
 * password is never shown here. The box only says whether Windows has it
 * saved, so that the administrator knows whether it has to be typed.
 */
function PcNetworkBox({
  network,
  onUse,
}: {
  network: PcNetwork;
  /** Omitted when there is nothing to fill in, because no board has appeared. */
  onUse?: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-[#f7f9fa] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        This PC is on
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-strong">
        {network.ssid}
        {network.ip ? (
          <span className="font-normal text-ink-muted"> · {network.ip}</span>
        ) : null}
        {network.signal ? (
          <span className="font-normal text-ink-faint"> · signal {network.signal}</span>
        ) : null}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {network.passwordSaved
          ? "The password for this network is saved on this PC, so it does not have to be typed."
          : "The password for this network is not saved on this PC, so it has to be typed."}
      </p>
      {onUse ? (
        <Button variant="secondary" onClick={onUse} className="mt-3">
          Use this network
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The networks that are in range.
 *
 * The board can be put on any of them, not only on the one this PC is on. Each
 * one says whether the password is already on this PC, so that the person
 * knows whether it has to be typed.
 */
function NearbyList({
  networks,
  scanning,
  canUse,
  onUse,
  onRescan,
}: {
  networks: NearbyNetwork[];
  scanning: boolean;
  /** False while there is no board to give a network to. */
  canUse: boolean;
  onUse: (network: NearbyNetwork) => void;
  onRescan: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-[#f7f9fa] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Networks in range
        </p>
        <Button variant="secondary" onClick={onRescan} disabled={scanning}>
          {scanning ? "Looking..." : "Look again"}
        </Button>
      </div>

      {networks.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {scanning
            ? "Looking for the networks around this PC..."
            : "Windows did not report any networks. The adapter may be off, or the PC may be on a cable."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {networks.map((network) => (
            <li
              key={network.ssid}
              className="flex items-start justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-strong">
                  {network.ssid}
                  {network.connected ? (
                    <span className="ml-2 text-xs font-normal text-ink-faint">
                      this PC is on it
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {[
                    network.band,
                    network.signal ? `signal ${network.signal}` : null,
                    network.security,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {network.passwordSaved
                    ? "The password is saved on this PC."
                    : "The password has to be typed."}
                </p>
              </div>
              {canUse ? (
                <Button variant="secondary" onClick={() => onUse(network)}>
                  Use
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        The board's Wi-Fi is <strong className="font-semibold">2.4 GHz only</strong>.
        A 5 GHz network will not work, even when it is in range.
      </p>
    </div>
  );
}

/**
 * The receiver's network.
 *
 * The board at the head station used to carry its Wi-Fi name and password in
 * the sketch, so changing the network meant changing the code and flashing the
 * board again. Here the master administrator types the new network in, and the
 * board is given it the next time it asks the PC for work.
 *
 * The console also reads the network this PC is on, because the board usually
 * belongs on the same network as the PC. When Windows has the password saved,
 * the password does not have to be typed at all.
 *
 * The board asks every few seconds, so a request that was made a moment ago is
 * usually taken within a few seconds. The list refreshes on the same rhythm.
 */
export function ReceiverNetworkPanel({
  receivers: initialReceivers,
}: {
  receivers: ReceiverRow[];
}) {
  const router = useRouter();
  const [receivers, setReceivers] = useState<ReceiverRow[]>(initialReceivers);
  const [stationId, setStationId] = useState(initialReceivers[0]?.stationId ?? "");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [pcNetwork, setPcNetwork] = useState<PcNetwork | null>(null);
  const [nearby, setNearby] = useState<NearbyNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => receivers.find((receiver) => receiver.stationId === stationId) ?? receivers[0],
    [receivers, stationId],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/receivers", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { receivers?: ReceiverRow[] };
      if (Array.isArray(data.receivers)) setReceivers(data.receivers);
    } catch {
      /* The PC is busy. The list keeps what it has. */
    }
  }, []);

  /*
   * The network this PC is on.
   *
   * It is read once when the card opens and then now and then, because it
   * hardly ever changes and reading it means running a command in Windows.
   */
  const readPcNetwork = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/network", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { network?: PcNetwork | null };
      if (data.network) setPcNetwork(data.network);
    } catch {
      /* The PC cannot say. The card simply does not show it. */
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void readPcNetwork();
    const timer = setInterval(readPcNetwork, 30000);
    return () => clearInterval(timer);
  }, [readPcNetwork]);

  /*
   * The networks that are in range.
   *
   * The board can be put on any of them, not only on the one this PC is on.
   * The scan is done once when the card opens, and again when the person asks
   * for it, because a scan makes Windows look for the networks around it.
   */
  const scanNetworks = useCallback(async (fresh = false) => {
    setScanning(true);
    try {
      const response = await fetch(
        `/api/admin/network/scan${fresh ? "?fresh=1" : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as { available?: NearbyNetwork[] };
      setNearby(Array.isArray(data.available) ? data.available : []);
    } catch {
      /* The PC cannot say. The list simply stays as it was. */
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void scanNetworks();
  }, [scanNetworks]);

  /*
   * The name of the network this PC is on fills the box in, the first time it
   * is known. That is the network the board usually belongs on, and it saves
   * typing it. A name that was typed by hand is never overwritten.
   */
  useEffect(() => {
    if (!pcNetwork?.ssid) return;
    setSsid((current) => (current.length === 0 ? pcNetwork.ssid ?? "" : current));
  }, [pcNetwork?.ssid]);

  /**
   * The network that is in the box, as the scan found it.
   *
   * It is what says whether the password of that network is already on this
   * PC, so that the person does not have to type it.
   */
  const chosen = useMemo(
    () => nearby.find((network) => network.ssid === ssid.trim()) ?? null,
    [nearby, ssid],
  );

  /** True when the password of the network in the box is already on this PC. */
  const passwordIsSaved =
    chosen?.passwordSaved === true ||
    (Boolean(pcNetwork?.ssid) && pcNetwork?.ssid === ssid.trim() && pcNetwork?.passwordSaved === true);

  /** True when the network in the box is on the band the board can use. */
  const boardCanUseIt = chosen ? !(chosen.band ?? "").includes("5 GHz") || (chosen.band ?? "").includes("2.4") : true;

  async function send() {
    if (!selected) return;
    setMessage(null);
    if (!ssid.trim()) {
      setMessage({ tone: "bad", text: "The name of the network is needed." });
      return;
    }
    /*
     * The board's Wi-Fi is 2.4 GHz only. A 5 GHz network is in range and looks
     * fine on the list, but the board will never get on it, so it is better to
     * say so here than to let it fail on the board.
     */
    if (chosen && !boardCanUseIt) {
      setMessage({
        tone: "bad",
        text: "The board's Wi-Fi is 2.4 GHz only. That network is 5 GHz, so the board cannot get on it.",
      });
      return;
    }

    setBusy(true);
    const result = await sendJson(
      "/api/admin/receivers",
      { stationId: selected.stationId, ssid: ssid.trim(), password },
      "POST",
    );
    setBusy(false);
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? "The board has been asked. It takes it the next time it asks the PC for work."
        : result.message,
    });
    if (result.ok) {
      setPassword("");
      await refresh();
      router.refresh();
    }
  }

  async function cancel() {
    if (!selected) return;
    setMessage(null);
    const result = await sendJson(
      `/api/admin/receivers?stationId=${encodeURIComponent(selected.stationId)}`,
      undefined,
      "DELETE",
    );
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok ? "The request was taken back." : result.message,
    });
    if (result.ok) await refresh();
  }

  /** Puts a network from the list into the box. */
  function choose(network: NearbyNetwork) {
    setSsid(network.ssid);
    setMessage(
      network.passwordSaved
        ? {
            tone: "good",
            text: `The network name is in the box. The password is saved on this PC, so it can be left empty.`,
          }
        : {
            tone: "bad",
            text: `The network name is in the box. The password for ${network.ssid} is not saved on this PC, so it has to be typed.`,
          },
    );
  }

  if (receivers.length === 0) {
    return (
      <Card>
        <CardHeader
          title="The receiver's network"
          description="Change the Wi-Fi the board at the head station uses."
        />
        {pcNetwork?.ssid ? (
          <div className="px-5 pt-4">
            <PcNetworkBox network={pcNetwork} />
          </div>
        ) : null}
        <div className="px-5 pt-4">
          <NearbyList
            networks={nearby}
            scanning={scanning}
            canUse={false}
            onUse={choose}
            onRescan={() => void scanNetworks(true)}
          />
        </div>
        <p className="px-5 py-6 text-sm leading-relaxed text-ink-muted">
          No board has talked to this PC yet. The board has to be set up once
          from its own setup page, and after that it appears here. Join the
          Wi-Fi called <strong className="font-semibold text-ink-strong">Freery-Setup</strong>{" "}
          and open <strong className="font-semibold text-ink-strong">http://192.168.4.1</strong>{" "}
          to set it up.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="The receiver's network"
        description="Change the Wi-Fi the board at the head station uses."
      />

      <div className="space-y-4 px-5 py-4">
        {pcNetwork?.ssid ? (
          <PcNetworkBox
            network={pcNetwork}
            onUse={() => {
              setSsid(pcNetwork.ssid ?? "");
              setMessage(null);
            }}
          />
        ) : null}

        <NearbyList
          networks={nearby}
          scanning={scanning}
          canUse
          onUse={choose}
          onRescan={() => void scanNetworks(true)}
        />

        <Field label="Board" htmlFor="receiver-select">
          <select
            id="receiver-select"
            value={selected?.stationId ?? ""}
            onChange={(event) => {
              setStationId(event.target.value);
              setMessage(null);
            }}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {receivers.map((receiver) => (
              <option key={receiver.stationId} value={receiver.stationId}>
                {receiver.stationId}
              </option>
            ))}
          </select>
        </Field>

        {selected ? (
          <div className="rounded-xl border border-line bg-[#f7f9fa] px-4 py-3 text-sm leading-relaxed">
            <p className="font-semibold text-ink-strong">
              {boardState(selected)}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              Last heard from {timeAgo(selected.lastSeenAt)}.
            </p>
          </div>
        ) : null}

        {selected?.command && selected.command.status !== "cancelled" ? (
          <Alert tone={commandState(selected.command).tone}>
            <p className="font-semibold">
              {commandState(selected.command).text}
            </p>
            <p className="mt-1 text-xs opacity-80">
              Network asked for: {selected.command.ssid}
            </p>
            {selected.command.status === "pending" ? (
              <Button
                variant="secondary"
                onClick={cancel}
                disabled={busy}
                className="mt-3"
              >
                Take the request back
              </Button>
            ) : null}
          </Alert>
        ) : null}

        <Field
          label="Network name"
          htmlFor="receiver-ssid"
          hint="The name of the Wi-Fi the board should use. It is the name on your router."
        >
          <Input
            id="receiver-ssid"
            value={ssid}
            maxLength={64}
            placeholder="For example: PortStation-WiFi"
            onChange={(event) => {
              setSsid(event.target.value);
              setMessage(null);
            }}
          />
        </Field>

        <Field
          label="Network password"
          htmlFor="receiver-password"
          hint={
            passwordIsSaved
              ? "This one is saved on the PC, so it can be left empty. It is written once and is never shown again."
              : chosen
                ? "This one is not saved on the PC, so the password has to be typed. It is written once and is never shown again."
                : "Leave it empty for a network without a password. It is written once and is never shown again."
          }
        >
          <Input
            id="receiver-password"
            type="password"
            value={password}
            maxLength={128}
            autoComplete="off"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {message ? (
          <p
            role="status"
            className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${
              message.tone === "good"
                ? "border-[#c9e8db] bg-[#e8f6f0] text-[#066a49]"
                : "border-[#f3d3d1] bg-[#fdeceb] text-[#8f2c24]"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <Button variant="primary" onClick={send} disabled={busy} className="w-full">
          {busy ? "Sending..." : "Send to the board"}
        </Button>

        <Footnote>
          The board asks this PC every few seconds, so it usually takes the new
          network within a few seconds. If it cannot get on, it keeps the
          network it already had and says so here. A board that has never been
          on any network cannot be reached this way: it has to be set once from
          its own setup page, by joining the Wi-Fi called Freery-Setup.
          {" "}
          The password is written once, the board is given it once, and it is
          cleared straight away. It is never shown here again.
        </Footnote>
      </div>
    </Card>
  );
}
