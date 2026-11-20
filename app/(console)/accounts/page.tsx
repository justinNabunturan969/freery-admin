import { auth } from "@/lib/auth";
import { getStations, getUsers } from "@/lib/queries";
import { Card, CardHeader, Footnote } from "@/components/ui/primitives";
import { PageHeader } from "@/components/admin/PageHeader";
import { AccountsManager } from "@/components/admin/AccountsManager";

export const dynamic = "force-dynamic";

/**
 * Accounts.
 *
 * The master administrator creates, edits, disables and removes the station
 * administrator accounts.
 *
 * The station administrator sees the same page, with the manager holding only
 * the accounts of its own station. The rule is enforced by the database and
 * by the route, not by hiding a button.
 */
export default async function AccountsPage() {
  const session = await auth();
  const [users, stations] = await Promise.all([getUsers(), getStations()]);

  // A station administrator only sees the accounts of their own station.
  // The card list follows the same rule as the table of the manager.
  const stationId = session?.user?.stationId ?? null;

  const accountRows = users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    stationId: user.stationId,
    stationName: user.stationName,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
  }));

  const stationOptions = stations.map((station) => ({
    id: station.id,
    name: station.name,
  }));

  return (
    <>
      <PageHeader
        title="Accounts"
        description="The people who can sign in, what they are allowed to do, and which station they belong to."
      />

      <Card>
        <CardHeader
          title="All accounts"
          description="Disabled accounts are refused at the sign in page. Passwords are stored as bcrypt hashes and are never shown again."
        />
        <AccountsManager
          users={accountRows}
          stations={stationOptions}
          ownUserId={session?.user?.id ?? ""}
          viewerRole={session?.user?.role ?? "STAFF"}
          viewerStationId={stationId}
        />
        <Footnote>
          {session?.user?.role === "ADMIN" ? (
            <>
              As the master administrator you can change the ferries, the
              stations and every account. Every change is written to the audit
              log with your name.
            </>
          ) : (
            <>
              As a station administrator you can count passengers, correct the
              manifest, read the logs and manage the accounts of your own
              station. The ferries and the stations are read only, and you can
              never create a master administrator or change a role.
            </>
          )}
        </Footnote>
      </Card>
    </>
  );
}
