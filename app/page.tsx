import { redirect } from "next/navigation";
import { MODE } from "@/lib/mode";

export const dynamic = "force-dynamic";

/**
 * The front door.
 *
 * The admin process lands on the overview, the counter process lands on the
 * counting screen. The middleware has already made sure the visitor is
 * signed in before it gets here.
 */
export default function Home() {
  redirect(MODE === "counter" ? "/counter" : "/overview");
}
