import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Station management.
 *
 * The stations are the second panel of the console box, not a page of their
 * own. The console is one screen with one card, and the Ferries and Stations
 * tabs swap that card in place.
 *
 * This address is kept so that an old link, a bookmark or a shared console
 * still lands on the stations: it goes to the same console, with the stations
 * panel on show.
 */
export default function StationManagementPage() {
  redirect("/overview?tab=stations");
}
