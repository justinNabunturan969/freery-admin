import Link from "next/link";
import { AdminNav, ADMIN_LINKS, type AdminLink } from "@/components/admin/AdminNav";
import { MobileNav } from "@/components/admin/MobileNav";
import { StationAdminMenu } from "@/components/admin/StationAdminMenu";
import { ScrollToTop } from "@/components/ui/ScrollToTop";

/**
 * The console shell.
 *
 * One shell for the whole system. The master administrator and the station
 * administrator get the same bar across the top, the same account menu and the
 * same page width. Only the sections in the bar differ, because the station
 * administrator has the counting screen and the master administrator does not.
 *
 * On a narrow screen the bar keeps the logo, the view badge and the burger,
 * and the sections slide out of the side. Nothing in the app is laid out for
 * one screen size: the bar reflows, the cards reflow, and the page itself is
 * the same page at any width.
 */
export function AdminShell({
  children,
  userName,
  userRole,
  userUsername,
  viewLabel = "Admin view",
  links = ADMIN_LINKS,
  footerNote = "Live operations data",
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  userUsername: string;
  /** The badge next to the logo: "Admin view" or "Station view". */
  viewLabel?: string;
  /** The sections in the top bar. */
  links?: AdminLink[];
  /** The line on the right of the footer. */
  footerNote?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-admin items-center gap-3 px-4 py-2.5">
          <Link href="/overview" className="flex shrink-0 items-center gap-2">
            <img
              src="/logo/freery-icon.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="text-base font-semibold tracking-tight text-ink-strong">
              freery
            </span>
          </Link>

          <span className="hidden rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 sm:inline">
            {viewLabel}
          </span>

          <AdminNav links={links} />

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <StationAdminMenu name={userName} role={userRole} username={userUsername} />
            </div>
            <MobileNav links={links} badgeLabel={viewLabel} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-admin flex-1 px-4 py-5 sm:py-6">
        {children}
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-admin flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-ink-faint">
          <span className="font-medium tracking-wide">Freery · Admin workspace</span>
          <span>{footerNote}</span>
        </div>
      </footer>
    </div>
  );
}
