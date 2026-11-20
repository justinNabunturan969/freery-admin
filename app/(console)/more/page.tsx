import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/admin/PageHeader";

/**
 * The sections of the station app.
 *
 * Every section is also in the bar at the top, so this page is the long form
 * of the same list: what each section is for, and what a station account is
 * allowed to do. It reflows with the rest of the console.
 */
export default function MorePage() {
  const links = [
    {
      href: "/overview",
      title: "Home",
      description:
        "The dashboard: the live route, the fleet and the stations, the signed-in users and the recent activity.",
    },
    {
      href: "/counter",
      title: "Count",
      description:
        "The passenger counter for your own station, with the undo for the last tap.",
    },
    {
      href: "/overview?tab=stations",
      title: "Stations",
      description:
        "The eight stations on the route, read only. The fleet is on the Home tab.",
    },
    {
      href: "/sessions",
      title: "Sessions",
      description:
        "Who can sign in, who signed in last, and the session rules the server applies.",
    },
    {
      href: "/hardware",
      title: "Hardware",
      description:
        "The signal strength, the packet success rate and the state of the port station.",
    },
    {
      href: "/logs",
      title: "Logs",
      description:
        "The GPS packets, the passenger events and the activity log, with a CSV download.",
    },
    {
      href: "/accounts",
      title: "Accounts",
      description:
        "Create, disable and reset the staff accounts of your own station.",
    },
  ];

  return (
    <>
      <PageHeader
        title="All sections"
        description="Everything the station app can do. They are all in the bar at the top as well."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-ink-strong">
                {link.title}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand-600"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
            <span className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {link.description}
            </span>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="What a station account cannot do"
          description="The limits are enforced by the database, not only by the screen."
        />
        <ul className="space-y-2 px-5 py-4 text-sm leading-relaxed text-ink-muted">
          <li>It cannot change the status, the capacity or the seats of a ferry.</li>
          <li>It cannot open or close a station, or put a notice on one.</li>
          <li>
            It cannot create an administrator, change the role of an account,
            or touch the accounts of another station.
          </li>
          <li>
            It can count passengers, correct the passenger manifest, read the
            logs, and manage the staff accounts of its own station.
          </li>
        </ul>
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Freery station app.
      </p>
    </>
  );
}
