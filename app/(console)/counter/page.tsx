import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { CounterScreen } from "@/components/counter/CounterScreen";

export const dynamic = "force-dynamic";

/**
 * The counter screen.
 *
 * Staff count passengers at their own station. The numbers are read from the
 * database on the head station PC over the network, and the same rules are
 * enforced on the server.
 */
export default async function CounterPage() {
  const session = await auth();
  const user = session?.user;
  const stationId = user?.stationId ?? null;

  const station = stationId
    ? await query<{
        id: number;
        name: string;
        order: number;
        isOpen: boolean;
        operatingHours: string | null;
      }>(
        `SELECT id, name, "order", "isOpen", "operatingHours"
         FROM "Station" WHERE id = $1`,
        [stationId],
      )
    : [];

  const ferries = await query<{
    id: number;
    name: string;
    capacity: number;
    seatsAvailable: number;
  }>(
    `SELECT id, name, capacity, "seatsAvailable"
     FROM "Ferry" WHERE "inOperation" IS TRUE ORDER BY id`,
  );

  const counts = await query<{
    ferryId: number;
    passengerType: string;
    onBoard: number;
  }>(`SELECT "ferryId", "passengerType", "onBoard" FROM passenger_counts`);

  const recent = await query<{
    id: number;
    ferryId: number;
    ferryName: string;
    passengerType: string;
    delta: number;
    createdAt: string;
  }>(
    `SELECT e.id, e."ferryId", f.name AS "ferryName", e."passengerType",
            e.delta, e."createdAt"
     FROM "PassengerEvent" e
     JOIN "Ferry" f ON f.id = e."ferryId"
     WHERE e."stationId" = $1
     ORDER BY e."createdAt" DESC, e.id DESC
     LIMIT 10`,
    [stationId],
  );

  return (
    <>
      <PageHeader
        title="Passenger counter"
        description="Count the passengers boarding and leaving at your station. Every tap is recorded with your name and the time."
      />
      <CounterScreen
      staffName={user?.name ?? "Staff"}
      station={station[0] ?? null}
      ferries={ferries.map((ferry) => {
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
      })}
      recent={recent.map((entry) => ({
        id: entry.id,
        ferryId: entry.ferryId,
        ferryName: entry.ferryName,
        passengerType: entry.passengerType,
        delta: entry.delta,
        createdAt: entry.createdAt,
      }))}
    />
    </>
  );
}
