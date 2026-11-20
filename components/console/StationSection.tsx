"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "@/lib/client";
import { announceFleetChange } from "@/lib/fleetEvents";
import { scrollIntoViewNear } from "@/lib/scroll";
import { Card, CardHeader } from "@/components/ui/primitives";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { formatDate, formatTime } from "@/components/ui/stats";
import { PlusIcon } from "@/components/ui/icons";
import { RelativeTime } from "@/components/ui/RelativeTime";

export interface StationOption {
  id: number;
  name: string;
  lat: number;
  lon: number;
  isOpen: boolean;
  notice: string | null;
  operatingHours: string | null;
  boardingInfo: string | null;
  updatedAt: string | null;
}

/**
 * The next point on the route line.
 *
 * A new station is placed one step beyond the last station. The administrator
 * can change the position if needed.
 */
export function nextPointOnExampleLine(stations: StationOption[]): {
  lat: number;
  lon: number;
} {
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (!first || !last) return { lat: 0, lon: 0 };
  const gap = stations.length > 1 ? (last.lon - first.lon) / (stations.length - 1) : 0.0297;
  return {
    lat: last.lat,
    lon: Number((last.lon + gap).toFixed(4)),
  };
}

/**
 * The station table and the update station panel.
 *
 * They share one piece of state, the station being edited, so pressing Edit
 * on a row moves the panel to that station.
 */
export function StationSection({
  stations,
  canEdit,
  routeName = "Route A",
}: {
  stations: StationOption[];
  canEdit: boolean;
  routeName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState(stations[0]?.id ?? 0);
  const [name, setName] = useState(stations[0]?.name ?? "");
  const [isOpen, setIsOpen] = useState(stations[0]?.isOpen ?? true);
  const [opensAt, setOpensAt] = useState("05:00 AM");
  const [closesAt, setClosesAt] = useState("09:00 PM");
  const [details, setDetails] = useState(stations[0]?.boardingInfo ?? "");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  // The update panel. Pressing Edit on a row brings it into view, so the
  // administrator never has to hunt for it down the page.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // The add form. It replaces the update panel in the same card.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLat, setNewLat] = useState(() =>
    String(nextPointOnExampleLine(stations).lat),
  );
  const [newLon, setNewLon] = useState(() =>
    String(nextPointOnExampleLine(stations).lon),
  );
  const [newOpensAt, setNewOpensAt] = useState("05:00 AM");
  const [newClosesAt, setNewClosesAt] = useState("09:00 PM");
  const [newDetails, setNewDetails] = useState("");

  const selected = useMemo(
    () => stations.find((station) => station.id === selectedId) ?? stations[0],
    [stations, selectedId],
  );

  function pick(station: StationOption) {
    setSelectedId(station.id);
    setEditingId(station.id);
    setName(station.name);
    setIsOpen(station.isOpen);
    const hours = parseHours(station.operatingHours);
    setOpensAt(hours.opens);
    setClosesAt(hours.closes);
    setDetails(station.boardingInfo ?? "");
    setMessage(null);
    // Bring the update panel into view and put the cursor in it, so the
    // administrator can carry straight on with the edit.
    scrollIntoViewNear(panelRef.current);
    selectRef.current?.focus({ preventScroll: true });
  }

  function chooseFromList(id: number) {
    const station = stations.find((item) => item.id === id);
    if (!station) return;
    setSelectedId(id);
    setName(station.name);
    setIsOpen(station.isOpen);
    const hours = parseHours(station.operatingHours);
    setOpensAt(hours.opens);
    setClosesAt(hours.closes);
    setDetails(station.boardingInfo ?? "");
    setMessage(null);
  }

  async function save() {
    if (!selected) return;
    setMessage(null);

    if (!name.trim()) {
      setMessage({ tone: "bad", text: "The station needs a name." });
      return;
    }

    const payload: Record<string, unknown> = { id: selected.id };
    if (name.trim() !== selected.name) payload.name = name.trim();
    if (isOpen !== selected.isOpen) payload.isOpen = isOpen;
    if (details.trim() !== (selected.boardingInfo ?? "")) {
      payload.boardingInfo = details.trim();
    }
    const hours = `Daily, ${opensAt} to ${closesAt}`;
    if (hours !== (selected.operatingHours ?? "")) payload.operatingHours = hours;

    if (Object.keys(payload).length === 1) {
      setMessage({ tone: "bad", text: "Nothing was changed." });
      return;
    }

    const result = await sendJson("/api/admin/stations", payload);
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? "Saved. The passenger station card is updated."
        : result.message,
    });
    if (result.ok) {
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  function reset() {
    if (!selected) return;
    setName(selected.name);
    setIsOpen(selected.isOpen);
    const hours = parseHours(selected.operatingHours);
    setOpensAt(hours.opens);
    setClosesAt(hours.closes);
    setDetails(selected.boardingInfo ?? "");
    setMessage(null);
  }

  /**
   * Remove a station from the route.
   *
   * A station that has counted passengers keeps its counts, so the server
   * refuses to delete it. Closing it is the way to keep the record and take
   * the stop off the passenger site.
   */
  async function removeStation() {
    if (!selected) return;
    setMessage(null);

    const confirmed = window.confirm(
      `Remove ${selected.name} from the route?`,
    );
    if (!confirmed) return;

    const result = await sendJson(
      `/api/admin/stations?id=${selected.id}`,
      {},
      "DELETE",
    );

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${selected.name} was removed from the route.`
        : result.message,
    });

    if (result.ok) {
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  /**
   * Add a station to the route.
   *
   * The station goes to the end of the route and shows on the passenger site
   * straight away, so it needs a name and a position.
   */
  async function addStation() {
    setMessage(null);

    if (!newName.trim()) {
      setMessage({ tone: "bad", text: "The station needs a name." });
      return;
    }

    const lat = Number(newLat);
    const lon = Number(newLon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setMessage({ tone: "bad", text: "The latitude has to be between -90 and 90." });
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setMessage({ tone: "bad", text: "The longitude has to be between -180 and 180." });
      return;
    }

    const result = await sendJson(
      "/api/admin/stations",
      {
        name: newName.trim(),
        lat,
        lon,
        operatingHours: `Daily, ${newOpensAt} to ${newClosesAt}`,
        boardingInfo: newDetails.trim(),
        isOpen: true,
      },
      "POST",
    );

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${newName.trim()} was added to the route.`
        : result.message,
    });

    if (result.ok) {
      const point = nextPointOnExampleLine([
        ...stations,
        {
          id: 0,
          name: newName.trim(),
          lat,
          lon,
          isOpen: true,
          notice: null,
          operatingHours: null,
          boardingInfo: null,
          updatedAt: null,
        },
      ]);
      setNewName("");
      setNewLat(String(point.lat));
      setNewLon(String(point.lon));
      setNewDetails("");
      setAdding(false);
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader
          title="Station management"
          align="start"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedTabs
                tabs={[
                  { key: "ferries", label: "Ferries" },
                  { key: "stations", label: "Stations" },
                ]}
              />
              <button
                type="button"
                onClick={() => {
                  const next = !adding;
                  setAdding(next);
                  setMessage(null);
                  if (next) {
                    // The add form lives in the panel beside the table, so it
                    // is brought into view and the cursor is put in it.
                    scrollIntoViewNear(panelRef.current);
                    nameRef.current?.focus({ preventScroll: true });
                  }
                }}
                disabled={!canEdit}
                aria-expanded={adding}
                title="Add a station to the route"
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
                  adding
                    ? "border-brand-500 bg-brand-500 text-white hover:bg-brand-600"
                    : "border-line bg-white text-ink-strong hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                <PlusIcon />
                {adding ? "Cancel" : "Add station"}
              </button>
            </div>
          }
        />

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-[#fafcfc] text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Station</th>
                <th scope="col" className="px-4 py-3 font-semibold">Route</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last updated</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Control</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => {
                const isEditing = editingId === station.id;
                return (
                  <tr
                    key={station.id}
                    className={`border-b border-line last:border-0 ${
                      isEditing ? "bg-brand-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-ink-strong">
                      {station.name}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{routeName}</td>
                    <td className="px-4 py-3">
                      {station.isOpen ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#07805a]">
                          <span className="h-2 w-2 rounded-full bg-[#0e9f6e]" aria-hidden="true" />
                          Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a5342b]">
                          <span className="h-2 w-2 rounded-full bg-[#c2453b]" aria-hidden="true" />
                          Closed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {station.updatedAt
                        ? `${formatDate(station.updatedAt)} · ${formatTime(station.updatedAt)}`
                        : "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => pick(station)}
                        disabled={!canEdit}
                        className={`inline-flex min-h-[40px] items-center rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
                          isEditing
                            ? "bg-brand-500 text-white hover:bg-brand-600"
                            : "border border-line bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                        }`}
                      >
                        {isEditing ? "Editing" : "Edit station"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line md:hidden">
          {stations.map((station) => {
            const isEditing = editingId === station.id;
            return (
              <li key={station.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-strong">
                      {station.name}
                    </span>
                    <span className="block text-xs text-ink-muted">{routeName}</span>
                  </span>
                  {station.isOpen ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#07805a]">
                      <span className="h-2 w-2 rounded-full bg-[#0e9f6e]" aria-hidden="true" />
                      Open
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a5342b]">
                      <span className="h-2 w-2 rounded-full bg-[#c2453b]" aria-hidden="true" />
                      Closed
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => pick(station)}
                    disabled={!canEdit}
                    className={`inline-flex min-h-[40px] items-center rounded-xl px-3 text-xs font-medium transition-colors disabled:text-ink-faint ${
                      isEditing
                        ? "bg-brand-500 text-white"
                        : "border border-line bg-white text-brand-700 hover:bg-brand-50"
                    }`}
                  >
                    {isEditing ? "Editing" : "Edit"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div ref={panelRef} className="min-w-0">
        <Card>
          <CardHeader
            title={adding ? "Add a station" : "Update station"}
            description={
              adding
                ? "A new station joins the route and shows on the passenger site"
                : canEdit
                  ? "Authorized controls"
                  : "Read only · Only the master administrator can change a station"
            }
          />

          {adding ? (
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Station name
                </p>
                <input
                  ref={nameRef}
                  type="text"
                  maxLength={80}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="For example: Station 9"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Latitude
                  </p>
                  <input
                    type="number"
                    step="0.0001"
                    min={-90}
                    max={90}
                    value={newLat}
                    onChange={(event) => setNewLat(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Longitude
                  </p>
                  <input
                    type="number"
                    step="0.0001"
                    min={-180}
                    max={180}
                    value={newLon}
                    onChange={(event) => setNewLon(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Opens at
                  </p>
                  <input
                    type="text"
                    value={newOpensAt}
                    onChange={(event) => setNewOpensAt(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Closes at
                  </p>
                  <input
                    type="text"
                    value={newClosesAt}
                    onChange={(event) => setNewClosesAt(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm font-ink"
                  />
                </div>
              </div>

              <p className="text-xs leading-relaxed text-ink-faint">
                Set the station position on the route. You can change the
                coordinates later if needed.
              </p>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Station details · Visible to passengers
                </p>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={newDetails}
                  onChange={(event) => setNewDetails(event.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink"
                />
              </div>

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
                  onClick={addStation}
                  disabled={pending}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {pending ? "Adding..." : "Add the station"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setMessage(null);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !selected ? (
            <p className="px-5 py-6 text-sm text-ink-muted">
              There are no stations yet.
            </p>
          ) : (
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Selected station
                </p>
                <select
                  ref={selectRef}
                  value={String(selectedId)}
                  onChange={(event) => chooseFromList(Number(event.target.value))}
                  disabled={!canEdit}
                  className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                >
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Station name
                  </p>
                  <input
                    type="text"
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!canEdit}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Status
                  </p>
                  <select
                    value={isOpen ? "open" : "closed"}
                    onChange={(event) => setIsOpen(event.target.value === "open")}
                    disabled={!canEdit}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Opens at
                  </p>
                  <input
                    type="text"
                    value={opensAt}
                    onChange={(event) => setOpensAt(event.target.value)}
                    disabled={!canEdit}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Closes at
                  </p>
                  <input
                    type="text"
                    value={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                    disabled={!canEdit}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                  />
                </div>
              </div>

              <p className="text-xs text-ink-muted">Operating days: Daily</p>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Station details · Visible to passengers
                </p>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink disabled:text-ink-faint"
                />
              </div>

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
                  {pending ? "Saving..." : "Save station"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={!canEdit}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:text-ink-faint"
                >
                  Reset
                </button>
              </div>

              <button
                type="button"
                onClick={removeStation}
                disabled={!canEdit || pending}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#f3d3d1] bg-white px-4 text-sm font-medium text-[#8f2c24] transition-colors hover:bg-[#fdeceb] disabled:text-ink-faint"
              >
                Remove this station from the route
              </button>

              <p className="text-xs leading-relaxed text-ink-faint">
                Last update <RelativeTime iso={selected.updatedAt} />
              </p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

/** Splits "Daily, 05:00 AM to 09:00 PM" into the two time fields. */
function parseHours(value: string | null): { opens: string; closes: string } {
  const fallback = { opens: "05:00 AM", closes: "09:00 PM" };
  if (!value) return fallback;
  const match = value.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM))[\s\S]*?(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
  );
  if (!match) return fallback;
  return { opens: match[1] ?? fallback.opens, closes: match[2] ?? fallback.closes };
}
