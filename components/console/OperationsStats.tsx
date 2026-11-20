import { StatCard } from "@/components/ui/stats";
import {
  PassengersIcon,
  SeatIcon,
  ShipIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { OverviewStats, SessionSummary } from "@/lib/queries";

/**
 * The four numbers at the top of the operations pages.
 *
 * Every one of them is a live read of the database.
 */
export function OperationsStats({
  stats,
  sessions,
}: {
  stats: OverviewStats;
  sessions: SessionSummary;
}) {
  const ferryHint = [
    stats.underwayFerries > 0 ? `${stats.underwayFerries} underway` : null,
    stats.dockedFerries > 0 ? `${stats.dockedFerries} at a station` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Signed in now"
        value={sessions.onlineNow}
        hint={`${stats.activeAccounts} accounts · refreshed every 15 seconds`}
        icon={<UsersIcon />}
      />
      <StatCard
        label="Ferries in operation"
        value={`${stats.activeFerries} / ${stats.totalFerries}`}
        hint={ferryHint || "No ferry is in operation"}
        icon={<ShipIcon />}
      />
      <StatCard
        label="Passengers aboard"
        value={stats.passengersOnBoard}
        hint="Across operating ferries"
        icon={<PassengersIcon />}
      />
      <StatCard
        label="Available seats"
        value={stats.availableSeats}
        hint={`Of ${stats.operatingSeats} operating seats`}
        icon={<SeatIcon />}
      />
    </div>
  );
}
