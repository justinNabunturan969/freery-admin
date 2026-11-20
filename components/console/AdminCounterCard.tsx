"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PASSENGER_TYPES,
  PASSENGER_TYPE_LABELS,
  type PassengerType,
} from "@freery/shared";
import { Card, CardHeader } from "@/components/ui/primitives";

export interface AdminCounterFerry {
  id: number;
  name: string;
  capacity: number;
  seatsAvailable: number;
  onBoard: number;
  counts: { passengerType: string; onBoard: number }[];
}

export interface AdminCounterStation {
  id: number;
  name: string;
}

/**
 * Passenger counting for the master administrator.
 *
 * The same add and remove controls the station administrators use on the
 * counter, with a station picker so the master administrator can count at any
 * station from the admin console.
 */
export function AdminCounterCard({
  ferries: initialFerries,
  stations,
}: {
  ferries: AdminCounterFerry[];
  stations: AdminCounterStation[];
}) {
  const router = useRouter();
  const [ferries, setFerries] = useState(initialFerries);
  const [stationId, setStationId] = useState(stations[0]?.id ?? 0);
  const [ferryId, setFerryId] = useState(initialFerries[0]?.id ?? 0);
  const [passengerType, setPassengerType] = useState<PassengerType>("STUDENT");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const selected = useMemo(
    () => ferries.find((ferry) => ferry.id === ferryId) ?? ferries[0],
    [ferries, ferryId],
  );

  const typeCount = useMemo(() => {
    if (!selected) return 0;
    return (
      selected.counts.find((count) => count.passengerType === passengerType)
        ?.onBoard ?? 0
    );
  }, [selected, passengerType]);

  function applyDelta(
    list: AdminCounterFerry[],
    targetFerryId: number,
    targetType: PassengerType,
    delta: 1 | -1,
  ): AdminCounterFerry[] {
    return list.map((ferry) => {
      if (ferry.id !== targetFerryId) return ferry;
      const counts = [...ferry.counts];
      const index = counts.findIndex(
        (count) => count.passengerType === targetType,
      );
      const current = index >= 0 ? (counts[index]?.onBoard ?? 0) : 0;
      const next = Math.max(0, current + delta);
      if (index >= 0) {
        counts[index] = { passengerType: targetType, onBoard: next };
      } else {
        counts.push({ passengerType: targetType, onBoard: next });
      }
      const onBoard = counts.reduce((sum, count) => sum + count.onBoard, 0);
      return {
        ...ferry,
        counts,
        onBoard,
        seatsAvailable: Math.max(0, ferry.capacity - onBoard),
      };
    });
  }

  async function send(delta: 1 | -1) {
    if (pending || !selected || !stationId) return;
    setPending(true);
    setError(null);
    setSaved(null);

    const snapshot = ferries;
    setFerries(applyDelta(ferries, selected.id, passengerType, delta));

    try {
      const response = await fetch("/api/counter/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ferryId: selected.id,
          passengerType,
          delta,
          stationId,
          clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        seatsAvailable?: number;
        onBoard?: number;
      };

      if (!response.ok) {
        setFerries(snapshot);
        setError(data.error ?? "Not saved, try again");
        setPending(false);
        return;
      }

      setFerries((current) =>
        current.map((ferry) => {
          if (ferry.id !== selected.id) return ferry;
          const seats =
            typeof data.seatsAvailable === "number"
              ? data.seatsAvailable
              : ferry.seatsAvailable;
          const onBoard =
            typeof data.onBoard === "number"
              ? data.onBoard
              : Math.max(0, ferry.capacity - seats);
          return { ...ferry, seatsAvailable: seats, onBoard };
        }),
      );
      setSaved(delta > 0 ? "Passenger added." : "Passenger removed.");
      setPending(false);
      router.refresh();
    } catch {
      setFerries(snapshot);
      setError("Not saved, try again. The station PC could not be reached.");
      setPending(false);
    }
  }

  if (!selected || stations.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Passenger count"
          description="Add or remove passengers by type."
        />
        <p className="px-5 py-6 text-sm text-ink-muted">
          A station and a ferry in operation are needed before passengers can be
          counted.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Passenger count"
        description="Add or remove passengers by type at any station."
      />

      <div className="space-y-4 px-5 py-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Station
          </span>
          <select
            value={String(stationId)}
            onChange={(event) => {
              setStationId(Number(event.target.value));
              setError(null);
              setSaved(null);
            }}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Ferry
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ferries.map((ferry) => {
              const active = ferry.id === selected.id;
              return (
                <button
                  key={ferry.id}
                  type="button"
                  onClick={() => {
                    setFerryId(ferry.id);
                    setError(null);
                    setSaved(null);
                  }}
                  aria-pressed={active}
                  className={`min-h-[52px] rounded-2xl border px-3 text-left transition-colors ${
                    active
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink-strong hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  <span className="block text-sm font-semibold">{ferry.name}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      active ? "text-white/85" : "text-ink-muted"
                    }`}
                  >
                    {ferry.onBoard} on board · {ferry.seatsAvailable} seats left
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Passenger type
          </p>
          <div className="flex flex-wrap gap-2">
            {PASSENGER_TYPES.map((type) => {
              const active = type === passengerType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setPassengerType(type);
                    setError(null);
                    setSaved(null);
                  }}
                  aria-pressed={active}
                  className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold transition-colors ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line bg-white text-ink-muted hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {PASSENGER_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-page p-4">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
              {PASSENGER_TYPE_LABELS[passengerType]} on {selected.name}
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-ink-strong">
              {typeCount}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => send(-1)}
              disabled={pending}
              aria-label={`Remove one ${PASSENGER_TYPE_LABELS[passengerType].toLowerCase()}`}
              className="min-h-[60px] rounded-2xl border-2 border-line bg-white text-2xl font-semibold text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
            >
              &minus;
            </button>
            <button
              type="button"
              onClick={() => send(1)}
              disabled={pending}
              aria-label={`Add one ${PASSENGER_TYPE_LABELS[passengerType].toLowerCase()}`}
              className="min-h-[60px] rounded-2xl bg-brand-500 text-2xl font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-[#f3d3d1] bg-[#fdeceb] px-3 py-2 text-center text-sm text-[#8f2c24]"
            >
              {error}
            </p>
          ) : null}
          {saved && !error ? (
            <p
              role="status"
              className="mt-3 rounded-xl border border-[#c9e8db] bg-[#e8f6f0] px-3 py-2 text-center text-sm text-[#066a49]"
            >
              {saved}
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                On board
              </dt>
              <dd className="mt-1 text-base font-semibold text-ink-strong">
                {selected.onBoard} of {selected.capacity}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Seats left
              </dt>
              <dd className="mt-1 text-base font-semibold text-brand-600">
                {selected.seatsAvailable}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Card>
  );
}
