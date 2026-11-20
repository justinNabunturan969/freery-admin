import { getActivity, getStations, getUsers } from "@/lib/queries";
import {
  Card,
  CardHeader,
  Footnote,
} from "@/components/ui/primitives";
import { Meter, StatCard, formatDateTime, timeAgo } from "@/components/ui/stats";
import { PageHeader } from "@/components/admin/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Sessions.
 *
 * Who can sign in, who signed in last, and when the session policy expires.
 * The session is a signed token that lives for eight hours, so a staff
 * member has to sign in again the next morning.
 *
 * The master administrator and the station administrator read the same page.
 */
export default async function SessionsPage() {
  const [users, stations, activity] = await Promise.all([
    getUsers(),
    getStations(),
    getActivity(200),
  ]);

  const signIns = activity.filter((entry) => entry.action === "LOGIN");
  const today = new Date().toDateString();
  const signedInToday = signIns.filter(
    (entry) => new Date(entry.createdAt).toDateString() === today,
  );
  const activeUsers = users.filter((user) => user.isActive);
  const staffUsers = activeUsers.filter((user) => user.role === "STAFF");
  const assignedStaff = staffUsers.filter((user) => user.stationId !== null);

  const roleCounts = ["ADMIN", "STAFF"].map((role) => ({
    role,
    label: role === "ADMIN" ? "Master administrator" : "Station administrator",
    count: activeUsers.filter((user) => user.role === role).length,
  }));
  const roleTotal = roleCounts.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <>
      <PageHeader
        title="Sessions"
        description="The accounts that can sign in, the ones that signed in today, and the session rules the server applies."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active accounts"
          value={activeUsers.length}
          unit={`of ${users.length}`}
          tone="brand"
        />
        <StatCard
          label="Staff accounts"
          value={staffUsers.length}
          unit="accounts"
          hint={`${assignedStaff.length} assigned to a station`}
        />
        <StatCard
          label="Sign-ins today"
          value={signedInToday.length}
          unit="sign-ins"
          hint="A disabled account can never sign in."
        />
        <StatCard
          label="Session length"
          value="8"
          unit="hours"
          hint="Then the staff member signs in again."
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Signed-in users"
            description="The accounts that are allowed to sign in right now."
          />
          <div className="space-y-3 px-5 py-4">
            {roleCounts.map((entry) => (
              <div key={entry.role}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-strong">{entry.label}</span>
                  <span className="text-ink-muted">{entry.count}</span>
                </div>
                <div className="mt-1.5">
                  <Meter
                    value={entry.count}
                    max={roleTotal || 1}
                    tone="brand"
                    label={`${entry.count} ${entry.label} accounts`}
                  />
                </div>
              </div>
            ))}
          </div>
          <Footnote>
            The master administrator works on the station PC. Station
            administrators work at the counter.
          </Footnote>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Who signed in"
            description="The last sign in of every account, and where it happened."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-semibold">Account</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Station</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last sign in</th>
                  <th scope="col" className="px-4 py-3 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-strong">{user.name}</p>
                      <p className="text-xs text-ink-muted">@{user.username}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {user.role === "ADMIN" ? "Master administrator" : "Station administrator"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {user.stationName ?? "not assigned"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {user.lastLogin ? (
                        <>
                          <span className="block">{timeAgo(user.lastLogin)}</span>
                          <span className="text-xs text-ink-faint">
                            {formatDateTime(user.lastLogin)}
                          </span>
                        </>
                      ) : (
                        "never"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#07805a]">
                          <span className="h-2 w-2 rounded-full bg-[#0e9f6e]" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                          <span className="h-2 w-2 rounded-full bg-[#9aa7b1]" aria-hidden="true" />
                          Disabled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footnote>
            Five failed sign in attempts lock the account for fifteen minutes.
            A disabled account is refused before the password is even checked.
          </Footnote>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Sign-in history"
          description="The last sign ins, taken from the audit log."
        />
        {signIns.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted">
            No sign in has been recorded yet.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {signIns.slice(0, 20).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-3">
                <span className="text-sm font-medium text-ink-strong">
                  {entry.userName ?? "Unknown"}
                </span>
                <span className="text-sm text-ink-muted">signed in</span>
                <span className="text-xs text-ink-faint">{timeAgo(entry.createdAt)}</span>
                <span className="text-xs text-ink-faint">
                  {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        The counter process runs on {stations.length} stations and accepts only
        the accounts that are assigned to one of them. The admin process is
        served from the head station PC only.
      </p>
    </>
  );
}
