"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PASSENGER_TYPES,
  PASSENGER_TYPE_LABELS,
  type PassengerType,
} from "@freery/shared";
import { formatDate, formatTime } from "@/components/ui/stats";
import { StationPinIcon } from "@/components/ui/icons";
import { LiveFleetPreview } from "@/components/preview/LiveFleetPreview";

export interface CounterFerry {
  id: number;
  name: string;
  capacity: number;
  seatsAvailable: number;
  onBoard: number;
  counts: { passengerType: string; onBoard: number }[];
}

/**
 * The station the count is being recorded at.
 *
 * The name comes from the database, so it always matches the station on the
 * route, even after the master administrator renames it.
 */
export interface CounterStation {
  id: number;
  name: string;
  /** The position of the station on the route, counting from 1. */
  order: number;
  isOpen: boolean;
  operatingHours: string | null;
}

export interface RecentChange {
  id: number;
  ferryId: number;
  ferryName: string;
  passengerType: string;
  delta: number;
  createdAt: string;
}

/**
 * The passenger counter.
 *
 * One screen, the same at every width. The ferry selector and the passenger
 * type chips are at the top, the minus and plus buttons are below them, and
 * the route sits beside the numbers on a wide screen and under them on a
 * narrow one. The buttons are large because counting is the job of this
 * screen, not because the screen is a phone.
 *
 * Every tap carries a unique client id. A tap that fails says "Not saved,
 * try again" and the count goes back to what the server has, so a retried
 * tap is never counted twice.
 */
export function CounterScreen({
  staffName,
  station,
  ferries: initialFerries,
  recent: initialRecent,
}: {
  staffName: string;
  station: CounterStation | null;
  ferries: CounterFerry[];
  recent: RecentChange[];
}) {
  const router = useRouter();
  const [ferries, setFerries] = useState(initialFerries);
  const [recent, setRecent] = useState(initialRecent);
  const [ferryId, setFerryId] = useState(initialFerries[0]?.id ?? 0);
  const [passengerType, setPassengerType] = useState<PassengerType>("STUDENT");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{
    ferryId: number;
    passengerType: PassengerType;
    delta: 1 | -1;
  } | null>(null);

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

  /** The same change applied to the local copy of the numbers. */
  function applyDelta(
    list: CounterFerry[],
    targetFerryId: number,
    targetType: PassengerType,
    delta: 1 | -1,
  ): CounterFerry[] {
    return list.map((ferry) => {
      if (ferry.id !== targetFerryId) return ferry;
      const counts = [...ferry.counts];
      const index = counts.findIndex((count) => count.passengerType === targetType);
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

  async function send(
    targetFerryId: number,
    targetType: PassengerType,
    delta: 1 | -1,
    undo = false,
  ) {
    if (pending) return;
    setPending(true);
    setError(null);

    const snapshot = ferries;
    const snapshotRecent = recent;
    const optimistic = applyDelta(ferries, targetFerryId, targetType, delta);
    setFerries(optimistic);

    try {
      const response = await fetch("/api/counter/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ferryId: targetFerryId,
          passengerType: targetType,
          delta,
          clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
          stationId: station?.id,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        seatsAvailable?: number;
        onBoard?: number;
        duplicate?: boolean;
      };

      if (!response.ok) {
        setFerries(snapshot);
        setError(data.error ?? "Not saved, try again");
        setPending(false);
        return;
      }

      // The server is the authority on the numbers.
      const reconciled = snapshot.map((ferry) =>
        ferry.id === targetFerryId && data.seatsAvailable !== undefined
          ? {
              ...ferry,
              seatsAvailable: data.seatsAvailable,
              onBoard:
                data.onBoard ?? ferry.capacity - (data.seatsAvailable ?? ferry.seatsAvailable),
            }
          : ferry,
      );
      setFerries(reconciled);

      const entry: RecentChange = {
        id: Date.now(),
        ferryId: targetFerryId,
        ferryName:
          snapshot.find((ferry) => ferry.id === targetFerryId)?.name ?? "Ferry",
        passengerType: targetType,
        delta,
        createdAt: new Date().toISOString(),
      };
      setRecent([entry, ...snapshotRecent].slice(0, 10));

      setLastAction(
        undo ? null : { ferryId: targetFerryId, passengerType: targetType, delta },
      );
      setPending(false);
      router.refresh();
    } catch {
      setFerries(snapshot);
      setError("Not saved, try again");
      setPending(false);
    }
  }

  async function undo() {
    if (!lastAction) return;
    const action = lastAction;
    await send(action.ferryId, action.passengerType, action.delta === 1 ? -1 : 1, true);
  }

  if (!selected) {
    return (
      <div className="mx-auto flex max-w-admin flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-ink-strong">No ferries to count</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          There is no ferry in operation right now. Ask the master administrator
          to put a ferry into operation.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        {/*
          Which station the count belongs to.

          The count is recorded against this station, so it is said out loud
          above the numbers. A station administrator standing at the wrong stop
          sees the wrong name first.
        */}
        {station ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
            <StationPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink-strong">
                Counting at {station.name}
              </span>
              <span className="block text-xs leading-relaxed text-ink-muted">
                Stop {station.order} on the route ·{" "}
                {station.isOpen ? "Open" : "Closed"}
                {station.operatingHours ? ` · ${station.operatingHours}` : ""}
              </span>
            </span>
          </div>
        ) : null}

        <section aria-labelledby="ferry-heading">
          <h2
            id="ferry-heading"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted"
          >
            Ferry
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {ferries.map((ferry) => {
              const active = ferry.id === selected.id;
              return (
                <button
                  key={ferry.id}
                  type="button"
                  onClick={() => {
                    setFerryId(ferry.id);
                    setError(null);
                  }}
                  aria-pressed={active}
                  className={`min-h-[56px] rounded-2xl border px-3 py-2 text-left transition-colors ${
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
        </section>

        <section aria-labelledby="type-heading" className="mt-5">
          <h2
            id="type-heading"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted"
          >
            Passenger type
          </h2>
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
                  }}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold transition-colors ${
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
        </section>

        <section
          aria-labelledby="count-heading"
          className="mt-5 rounded-2xl border border-line bg-white p-5 shadow-card"
        >
          <h2 id="count-heading" className="sr-only">
            Passenger count
          </h2>

          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
              {PASSENGER_TYPE_LABELS[passengerType]} on {selected.name}
            </p>
            <p className="mt-1 text-5xl font-semibold tracking-tight text-ink-strong">
              {typeCount}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => send(selected.id, passengerType, -1)}
              disabled={pending}
              aria-label={`Remove one ${PASSENGER_TYPE_LABELS[passengerType].toLowerCase()}`}
              className="min-h-[76px] rounded-2xl border-2 border-line bg-white text-3xl font-semibold text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50 xl:min-h-[96px]"
            >
              &minus;
            </button>
            <button
              type="button"
              onClick={() => send(selected.id, passengerType, 1)}
              disabled={pending}
              aria-label={`Add one ${PASSENGER_TYPE_LABELS[passengerType].toLowerCase()}`}
              className="min-h-[76px] rounded-2xl bg-brand-500 text-3xl font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50 xl:min-h-[96px]"
            >
              +
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[#f3d3d1] bg-[#fdeceb] px-4 py-3 text-center"
            >
              <p className="text-sm font-semibold text-[#8f2c24]">
                Not saved, try again
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#8f2c24]">
                {error}
              </p>
            </div>
          ) : null}

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                On board
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink-strong">
                {selected.onBoard} of {selected.capacity}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Seats left
              </dt>
              <dd className="mt-1 text-lg font-semibold text-brand-600">
                {selected.seatsAvailable}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="min-w-0 space-y-4">
        {/*
          The route. It is the same picture the passenger website and the
          master administrator's console show, so the counter and the map
          never disagree.
        */}
        <LiveFleetPreview />

        <section className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Recent changes
            </h2>
            <button
              type="button"
              onClick={undo}
              disabled={!lastAction || pending}
              className="min-h-[40px] rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:text-ink-faint"
            >
              Undo the last tap
            </button>
          </div>

          {recent.length === 0 ? (
            <p className="mt-2 rounded-xl border border-line bg-white px-4 py-4 text-sm text-ink-muted">
              Nothing counted at this station yet.
            </p>
          ) : (
            <ol className="mt-2 max-h-[360px] divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-white">
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      entry.delta > 0
                        ? "bg-[#e8f6f0] text-[#07805a]"
                        : "bg-[#fdeceb] text-[#a5342b]"
                    }`}
                  >
                    {entry.delta > 0 ? "+" : "−"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-strong">
                      {PASSENGER_TYPE_LABELS[entry.passengerType as PassengerType] ??
                        entry.passengerType}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {entry.ferryName} · {formatDate(entry.createdAt)} ·{" "}
                      {formatTime(entry.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="text-xs leading-relaxed text-ink-faint">
          Counts are estimates for the study. The count cannot go below zero or
          above the capacity, and every tap is recorded with your name and the
          time.
        </p>
      </div>
    </div>
  );
}
