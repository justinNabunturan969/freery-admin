import { auth } from "@/lib/auth";
import { MODE } from "@/lib/mode";
import { AdminShell } from "@/components/admin/AdminShell";
import { COUNTER_LINKS } from "@/components/admin/AdminNav";
import { ConsoleTabProvider } from "@/components/console/ConsoleTabProvider";

export const dynamic = "force-dynamic";

/**
 * The console shell.
 *
 * One codebase, one shell. The admin process shows the desktop console for the
 * head administrator. The station process shows the same console for the
 * station administrators, with the counting screen in the bar and the fleet and
 * the stations read only.
 *
 * The two are the same page at any width. Nothing is laid out for a phone:
 * the bar reflows into the drawer when the screen is narrow, the cards
 * reflow into one column, and the page stays the same page.
 *
 * The provider is around both shells, so the top bar can reach the Ferries and
 * Stations card that lives in the page. That is what lets "Station management"
 * in the bar swap the card in place instead of opening another page.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;

  if (MODE === "counter") {
    return (
      <ConsoleTabProvider>
        <AdminShell
          userName={user?.name ?? "Signed in"}
          userRole={user?.role ?? ""}
          userUsername={user?.username ?? ""}
          viewLabel="Station view"
          links={COUNTER_LINKS}
          footerNote="Live operations data"
        >
          {children}
        </AdminShell>
      </ConsoleTabProvider>
    );
  }

  return (
    <ConsoleTabProvider>
      <AdminShell
        userName={user?.name ?? "Signed in"}
        userRole={user?.role ?? ""}
        userUsername={user?.username ?? ""}
      >
        {children}
      </AdminShell>
    </ConsoleTabProvider>
  );
}
