import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listNearbyNetworks, readPcNetwork } from "@/lib/pcNetwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every network that is in range.
 *
 * The board at the head station can be put on any network the PC can see, not
 * only on the one the PC is on. So this route lists all of them, with the
 * signal, the band, and whether Windows has the password saved.
 *
 * The password is never in the answer. The answer only says whether Windows
 * has it saved, so that the console knows which ones can be given to the board
 * without anything being typed.
 *
 * This is a separate route from the one that reads the PC's own network,
 * because a scan makes Windows look for the networks around it. That takes a
 * moment, so it is only done when the console asks for it, and the answer is
 * kept for half a minute. `?fresh=1` looks again straight away.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /*
   * Only the head administrator.
   *
   * The counter process shares several `/api/admin/` routes with the console,
   * so a route that is about the head station has to check the role itself.
   */
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the head administrator can look for the networks around this PC" },
      { status: 403 },
    );
  }

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  /* The network this PC is on, so that it can be marked in the list. */
  const current = await readPcNetwork();
  const available = await listNearbyNetworks(current?.ssid ?? null, { fresh });

  return NextResponse.json({ available });
}
