import { receiverNetworkSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { fail, ok, firstIssue, readJson } from "@/lib/api";
import { savedPasswordFor } from "@/lib/pcNetwork";
import {
  cancelReceiverNetwork,
  getPortStations,
  requestReceiverNetwork,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The receiver's network, from the console.
 *
 *   GET     the boards that talk to this PC, the network each one is on, and
 *           the network each one is being asked to use.
 *   POST    ask a board to use a different network. The master administrator
 *           types it in instead of opening the Arduino IDE.
 *   DELETE  take the request back, while the board has not taken it yet.
 *
 * The password of the network is never in the answer. It is written once, the
 * board is given it once, and the console never shows it again.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);
  /* The boards that talk to the head station PC are the head administrator's
     business. The station accounts never see them, on either process. */
  if (session.user.role !== "ADMIN") {
    return fail("Only the head administrator can see the receivers", 403);
  }

  return ok({ receivers: await getPortStations() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);
  /* Only the head administrator changes the network a board uses. */
  if (session.user.role !== "ADMIN") {
    return fail("Only the head administrator can change the receiver's network", 403);
  }

  const parsed = receiverNetworkSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { stationId, ssid } = parsed.data;

  /*
   * The password.
   *
   * When the administrator leaves it empty and this PC has that network saved,
   * the password is taken from Windows. The board is usually being put on the
   * network this PC is already on, and that is the one the PC knows the
   * password for.
   *
   * The password never comes back to the browser. It goes straight into the
   * request for the board, which hands it over once and then clears it.
   */
  let password = parsed.data.password;
  if (!password) {
    const saved = await savedPasswordFor(ssid);
    if (saved !== null) password = saved;
  }

  const command = await requestReceiverNetwork({ stationId, ssid, password });
  return ok({ command, receivers: await getPortStations() });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);
  if (session.user.role !== "ADMIN") {
    return fail("Only the head administrator can change the receiver's network", 403);
  }

  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get("stationId");
  if (!stationId) return fail("Which receiver?", 400);

  const cancelled = await cancelReceiverNetwork(stationId);
  return ok({ cancelled, receivers: await getPortStations() });
}
