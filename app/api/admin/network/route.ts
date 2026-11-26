import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readPcNetwork } from "@/lib/pcNetwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The network this PC is on.
 *
 * The board at the head station has to be on the same network as this PC, so
 * the console shows the PC's own network on the receiver's network card, and
 * offers it to the board.
 *
 * The password is never in the answer. The answer only says whether Windows
 * has it saved, so that the console can tell the administrator that it does
 * not have to be typed.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /*
   * Only the head administrator.
   *
   * The middleware already keeps the station accounts out of the admin process,
   * but this route has to stand on its own: the same codebase runs as the
   * counter app, where a station account is a normal signed in person. The
   * network the head station PC is on is not theirs to see.
   */
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the head administrator can ask what network this PC is on" },
      { status: 403 },
    );
  }

  const network = await readPcNetwork();
  return NextResponse.json({ network });
}
