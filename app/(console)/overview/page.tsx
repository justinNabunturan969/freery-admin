import { auth } from "@/lib/auth";
import { MODE, canEditFleet } from "@/lib/mode";
import { pickFreeFerryColor } from "@freery/shared";
import { operationsStamp, passengerSiteUrl } from "@/lib/format";
import { query } from "@/lib/db";
import {
  getActivity,
  getFerries,
  getManifestEvents,
  getOverviewStats,
  getSessionSummary,
  getStations,
} from "@/lib/queries";
import { OperationsHeader } from "@/components/console/OperationsHeader";
import { OperationsStats } from "@/components/console/OperationsStats";
import { FleetSection } from "@/components/console/FleetSection";
import { StationSection } from "@/components/console/StationSection";
import { ConsolePanelSwitch } from "@/components/console/ConsolePanelSwitch";
import { SignedInUsersCard } from "@/components/console/SignedInUsersCard";
import { PassengerManifestCard } from "@/components/console/PassengerManifestCard";
import { RecentActivityCard } from "@/components/console/RecentActivityCard";
import { EditPassengerPanel } from "@/components/console/EditPassengerPanel";
import { AdminCounterCard } from "@/components/console/AdminCounterCard";
import { LiveFleetPreview } from "@/components/preview/LiveFleetPreview";
import { StationAccountCard } from "@/components/console/StationAccountCard";

export const dynamic = "force-dynamic";

/**
 * The operations overview.
 *
 * The fleet, the signed in sessions, the passenger manifest and the recent
 * activity. Every figure is a live read of the database on the head station
 * PC.
 *
 * The Ferries and Stations tabs switch the first card inside this page. The
 * page is never left, so the administrator keeps their place, and the
 * address bar keeps the choice so the console can be shared as a link.
 *
 * "Overview" and "Station management" in the top bar do the same thing: they
 * swap that card in place instead of opening another page.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const { tab } = await searchParams;
  const showStations = tab === "stations";

  const [stats, sessions, ferries, stations, events, activity, counts] = await Promise.all([
    getOverviewStats(),
    getSessionSummary(),
    getFerries(),
    getStations(),
    getManifestEvents(),
    getActivity(14),
    query<{ ferryId: number; passengerType: string; onBoard: number }>(
      `SELECT "ferryId", "passengerType", "onBoard" FROM passenger_counts`,
    ),
  ]);

  const canEdit = canEditFleet(session?.user?.role);

  // The colour the next boat will be given: the first one nobody in the
  // fleet is using. The add form says so before the boat is added.
  const nextColor = pickFreeFerryColor(ferries.map((ferry) => ferry.color));

  // The station administrator's own station, so the dashboard can say which
  // stop this account works at.
  const ownStation = session?.user?.stationId
    ? stations.find((station) => station.id === session.user.stationId) ?? null
    : null;

  const receiverOnline = stats.lastPacketAt
    ? Date.now() - new Date(stats.lastPacketAt).getTime() < 60_000
    : false;

  const manifestLines = events.map((event) => ({
    ferryId: event.ferryId,
    ferryName: event.ferryName,
    stationId: event.stationId,
    stationName: event.stationName,
    passengerType: event.passengerType,
    onBoard: 0,
  }));

  const counterFerries = ferries
    .filter((ferry) => ferry.inOperation)
    .map((ferry) => {
      const ferryCounts = counts
        .filter((count) => count.ferryId === ferry.id)
        .map((count) => ({
          passengerType: count.passengerType,
          onBoard: count.onBoard,
        }));
      const onBoard = ferryCounts.reduce((sum, count) => sum + count.onBoard, 0);
      return {
        id: ferry.id,
        name: ferry.name,
        capacity: ferry.capacity,
        seatsAvailable: ferry.seatsAvailable,
        onBoard,
        counts: ferryCounts,
      };
    });

  // The two panels of the one card. They are built here and handed to the
  // switch, so choosing one swaps the card in place and never leaves the
  // page.
  const ferriesPanel = (
    <FleetSection
      ferries={ferries.map((ferry) => ({
        id: ferry.id,
        name: ferry.name,
        status: ferry.status,
        capacity: ferry.capacity,
        seatsAvailable: ferry.seatsAvailable,
        inOperation: ferry.inOperation,
        receivedAt: ferry.receivedAt,
        lastSeq: ferry.lastSeq,
        color: ferry.color,
      }))}
      canEdit={canEdit}
      nextColor={nextColor}
    />
  );

  const stationsPanel = (
    <StationSection
      stations={stations.map((station) => ({
        id: station.id,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        isOpen: station.isOpen,
        notice: station.notice,
        operatingHours: station.operatingHours,
        boardingInfo: station.boardingInfo,
        updatedAt: station.updatedAt,
      }))}
      canEdit={canEdit}
    />
  );

  return (
    <>
      <OperationsHeader siteUrl={passengerSiteUrl()} stamp={operationsStamp()} />

      <OperationsStats stats={stats} sessions={sessions} />

      <div className="mt-4 space-y-4">
        <LiveFleetPreview />

        <ConsolePanelSwitch
          initialTab={showStations ? "stations" : "ferries"}
          ferries={ferriesPanel}
          stations={stationsPanel}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <SignedInUsersCard
              sessions={sessions}
              updatedLabel="Updated just now"
              unitsCount={ferries.filter((ferry) => ferry.inOperation).length}
              receiverOnline={receiverOnline}
              lastPacketAt={stats.lastPacketAt}
            />
            <PassengerManifestCard
              events={events}
              stations={stations.map((station) => ({
                id: station.id,
                name: station.name,
              }))}
            />
          </div>

          <div className="min-w-0 space-y-4">
            {MODE === "counter" ? (
              <StationAccountCard
                station={
                  ownStation
                    ? {
                        id: ownStation.id,
                        name: ownStation.name,
                        order: ownStation.order,
                        isOpen: ownStation.isOpen,
                        operatingHours: ownStation.operatingHours,
                        notice: ownStation.notice,
                      }
                    : null
                }
                stationCount={stations.length}
              />
            ) : null}
            {session?.user?.role === "ADMIN" ? (
              <AdminCounterCard
                ferries={counterFerries}
                stations={stations.map((station) => ({
                  id: station.id,
                  name: station.name,
                }))}
              />
            ) : null}
            <EditPassengerPanel
              lines={manifestLines}
              stations={stations.map((station) => ({
                id: station.id,
                name: station.name,
              }))}
              ferries={ferries.map((ferry) => ({
                id: ferry.id,
                name: ferry.name,
              }))}
              canEdit={canEdit}
            />
            <RecentActivityCard activity={activity} />
          </div>
        </div>
      </div>
    </>
  );
}
