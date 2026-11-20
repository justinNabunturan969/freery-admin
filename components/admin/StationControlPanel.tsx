"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "@/lib/client";
import { Button, Field, Select, Textarea } from "@/components/ui/primitives";

export interface StationOption {
  id: number;
  name: string;
  isOpen: boolean;
  notice: string | null;
}

/**
 * The update station panel.
 *
 * Closing a station is what the public website shows, so the notice is
 * written as a sentence to a passenger.
 */
export function StationControlPanel({ stations }: { stations: StationOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stationId, setStationId] = useState(stations[0]?.id ?? 0);
  const [isOpen, setIsOpen] = useState(stations[0]?.isOpen ?? true);
  const [notice, setNotice] = useState(stations[0]?.notice ?? "");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const selected = useMemo(
    () => stations.find((station) => station.id === stationId) ?? stations[0],
    [stations, stationId],
  );

  function chooseStation(id: number) {
    const station = stations.find((item) => item.id === id);
    setStationId(id);
    if (!station) return;
    setIsOpen(station.isOpen);
    setNotice(station.notice ?? "");
    setMessage(null);
  }

  async function save() {
    if (!selected) return;
    setMessage(null);

    const payload: Record<string, unknown> = { id: selected.id };
    if (isOpen !== selected.isOpen) payload.isOpen = isOpen;
    if (notice.trim() !== (selected.notice ?? "")) {
      payload.notice = notice.trim();
    }

    if (Object.keys(payload).length === 1) {
      setMessage({ tone: "bad", text: "Nothing was changed." });
      return;
    }

    const result = await sendJson("/api/admin/stations", payload);
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? "Saved. The public website shows the new state."
        : result.message,
    });
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  if (!selected) {
    return <p className="px-5 py-6 text-sm text-ink-muted">There are no stations yet.</p>;
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <Field label="Station" htmlFor="station-select">
        <Select
          id="station-select"
          value={String(stationId)}
          onChange={(event) => chooseStation(Number(event.target.value))}
        >
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
          State
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-pressed={isOpen}
            className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
              isOpen
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-line bg-white text-ink-muted hover:bg-[#eef1f3]"
            }`}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-pressed={!isOpen}
            className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
              !isOpen
                ? "border-[#f3d3d1] bg-[#fdeceb] text-[#8f2c24]"
                : "border-line bg-white text-ink-muted hover:bg-[#eef1f3]"
            }`}
          >
            Closed
          </button>
        </div>
      </fieldset>

      <Field
        label="Notice for the public"
        htmlFor="station-notice"
        hint="Shown on the public website while the station is closed."
      >
        <Textarea
          id="station-notice"
          rows={3}
          maxLength={300}
          placeholder="For example: boarding has moved to the north gate"
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
        />
      </Field>

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

      <Button
        variant="primary"
        onClick={save}
        disabled={pending}
        className="w-full"
      >
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
