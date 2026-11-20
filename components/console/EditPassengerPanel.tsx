"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PASSENGER_TYPES,
  PASSENGER_TYPE_LABELS,
  type PassengerType,
} from "@freery/shared";
import { sendJson } from "@/lib/client";
import { Card, CardHeader } from "@/components/ui/primitives";
import {
  manilaDateInput,
  manilaDateTimeToIso,
  manilaTimeInput,
} from "@/components/ui/stats";

export interface ManifestLine {
  ferryId: number;
  ferryName: string;
  stationId: number;
  stationName: string;
  passengerType: string;
  onBoard: number;
}

export interface EditStation {
  id: number;
  name: string;
}

export interface EditFerry {
  id: number;
  name: string;
}

/**
 * The edit passenger panel.
 *
 * The manifest is worked out from the counting events, so a correction is
 * never a plain overwrite. The panel writes the difference as a new event
 * with the date and the time the administrator gives, and it always needs a
 * reason. The reason and the account go into the audit log.
 */
export function EditPassengerPanel({
  lines,
  stations,
  ferries,
  canEdit,
}: {
  lines: ManifestLine[];
  stations: EditStation[];
  ferries: EditFerry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const [lineKey, setLineKey] = useState(lines[0] ? keyOf(lines[0]) : "");
  const [stationId, setStationId] = useState(String(lines[0]?.stationId ?? stations[0]?.id ?? ""));
  const [ferryId, setFerryId] = useState(String(lines[0]?.ferryId ?? ferries[0]?.id ?? ""));
  const [passengerType, setPassengerType] = useState<PassengerType>(
    (lines[0]?.passengerType as PassengerType) ?? "STUDENT",
  );
  const [onBoard, setOnBoard] = useState(String(lines[0]?.onBoard ?? 0));
  // The date and the time default to the Philippine clock, written the same
  // way on the server and in the browser so React does not see a difference.
  const [date, setDate] = useState(() => manilaDateInput(new Date()));
  const [time, setTime] = useState(() => manilaTimeInput(new Date()));
  const [reason, setReason] = useState("");

  const selectedLine = useMemo(
    () => lines.find((line) => keyOf(line) === lineKey) ?? lines[0],
    [lines, lineKey],
  );

  function chooseLine(key: string) {
    setLineKey(key);
    const line = lines.find((item) => keyOf(item) === key);
    if (!line) return;
    setStationId(String(line.stationId));
    setFerryId(String(line.ferryId));
    setPassengerType(line.passengerType as PassengerType);
    setOnBoard(String(line.onBoard));
    setMessage(null);
  }

  async function save() {
    setMessage(null);

    const value = Number(onBoard);
    if (!Number.isInteger(value) || value < 0) {
      setMessage({
        tone: "bad",
        text: "The count has to be a whole number of zero or more.",
      });
      return;
    }
    if (reason.trim().length < 3) {
      setMessage({
        tone: "bad",
        text: "A reason is required for a correction.",
      });
      return;
    }

    const occurredAt = manilaDateTimeToIso(date, time || "00:00");

    const result = await sendJson("/api/admin/passengers", {
      ferryId: Number(ferryId),
      stationId: Number(stationId),
      passengerType,
      onBoard: value,
      reason: reason.trim(),
      occurredAt,
    });

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? "Saved. The manifest and the exports are updated."
        : result.message,
    });
    if (result.ok) {
      setReason("");
      startTransition(() => router.refresh());
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit passenger"
      />

      <div className="space-y-4 px-5 py-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Manifest line
          </span>
          <select
            value={lineKey}
            onChange={(event) => chooseLine(event.target.value)}
            disabled={!canEdit || lines.length === 0}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
          >
            {lines.length === 0 ? (
              <option value="">Nothing to edit yet</option>
            ) : (
              lines.map((line) => (
                <option key={keyOf(line)} value={keyOf(line)}>
                  {line.stationName} · {line.ferryName} ·{" "}
                  {PASSENGER_TYPE_LABELS[line.passengerType as PassengerType] ??
                    line.passengerType}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Boarding station
            </span>
            <select
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
              disabled={!canEdit}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Ferry
            </span>
            <select
              value={ferryId}
              onChange={(event) => setFerryId(event.target.value)}
              disabled={!canEdit}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
            >
              {ferries.map((ferry) => (
                <option key={ferry.id} value={ferry.id}>
                  {ferry.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Passenger type
          </legend>
          <div className="flex flex-wrap gap-2">
            {PASSENGER_TYPES.map((type) => {
              const active = type === passengerType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPassengerType(type)}
                  disabled={!canEdit}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium transition-colors disabled:text-ink-faint ${
                    active
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink-strong hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {PASSENGER_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Passengers aboard
          </span>
          <input
            type="number"
            min={0}
            max={500}
            value={onBoard}
            onChange={(event) => setOnBoard(event.target.value)}
            disabled={!canEdit}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
          />
          {selectedLine ? (
            <span className="mt-1 block text-xs text-ink-faint">
              Recorded right now: {selectedLine.onBoard}
            </span>
          ) : null}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Boarding date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={!canEdit}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Boarding time
            </span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              disabled={!canEdit}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Reason for the correction
          </span>
          <input
            type="text"
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!canEdit}
            placeholder="For example: two students boarded from the other gate"
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint disabled:text-ink-faint"
          />
          <span className="mt-1 block text-xs text-ink-faint">
            Shown in the activity log with the account that made the change.
          </span>
        </label>

        {message ? (
          <p
            role="status"
            className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${
              message.tone === "good"
                ? "border-[#c9e8db] bg-[#e8f6f0] text-[#066a49]"
                : "border-[#f3d3d1] bg-[#fdeceb] text-[#8f2c24]"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canEdit || pending}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {pending ? "Saving..." : "Save passenger"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setReason("");
            }}
            disabled={!canEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:text-ink-faint"
          >
            Cancel
          </button>
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          Classification is included in the CSV and Excel exports.
        </p>
      </div>
    </Card>
  );
}

function keyOf(line: ManifestLine): string {
  return `${line.stationId}-${line.ferryId}-${line.passengerType}`;
}
