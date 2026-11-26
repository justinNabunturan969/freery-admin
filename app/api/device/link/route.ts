import { NextResponse } from "next/server";
import { deviceLinkSchema } from "@freery/shared";
import { deviceKeyMatches } from "@/lib/deviceKey";
import { takeReceiverNetwork, recordPortStation } from "@/lib/queries";
import { isCounterMode } from "@/lib/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The link between a receiver and this PC.
 *
 * The board at the head station asks this address every few seconds whether it
 * has been given a new network to use, and it says what its own network looks
 * like at the same time. The answer carries the new network, if there is one.
 *
 * The device key in the header proves the request comes from a board. It is
 * the same key the packets use, and it lives in an environment variable, never
 * in the browser code and never in the database.
 *
 *   401  the key is missing or wrong
 *   400  the body is not valid
 *   200  the board has been heard from, and here is what it should do
 *
 * The board never sends the password of the network it is on, and the server
 * never sends back a password it has already handed over.
 */
export async function POST(request: Request) {
  // The counter process never serves the device routes.
  if (isCounterMode()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = request.headers.get("x-device-key");
  if (!deviceKeyMatches(key)) {
    return NextResponse.json(
      { error: "The device key is missing or wrong" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The body is not valid JSON" }, { status: 400 });
  }

  const parsed = deviceLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The body is not a valid request from a receiver" },
      { status: 400 },
    );
  }

  const { stationId, wifi } = parsed.data;

  /*
   * Write down what the board says about its own network.
   *
   * A board that says nothing about its network is still heard from, so the
   * "last seen" time is written either way. The network it is on is only
   * written when the board says one, so a quiet board does not look like a
   * board that lost its network.
   */
  await recordPortStation({
    stationId,
    ssid: wifi?.ssid ?? null,
    status: wifi?.status ?? null,
    ip: wifi?.ip ?? null,
  });

  /*
   * And hand over the network it is being asked to use, if there is one.
   *
   * The password goes out exactly once. It is cleared from the database as it
   * is taken, so it does not wait in there after the board has it.
   */
  const command = await takeReceiverNetwork(stationId);

  return NextResponse.json({
    ok: true,
    stationId,
    serverTime: new Date().toISOString(),
    command: command
      ? { id: command.id, ssid: command.ssid, password: command.password }
      : null,
  });
}
