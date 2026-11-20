"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, type FerryStatus } from "@freery/shared";
import { sendJson } from "@/lib/client";
import { announceFleetChange } from "@/lib/fleetEvents";
import { scrollIntoViewNear } from "@/lib/scroll";
import { ferryColor } from "@/lib/preview";
import { Card, CardHeader } from "@/components/ui/primitives";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stepper } from "@/components/ui/Stepper";
import { Toggle } from "@/components/ui/Toggle";
import { PlusIcon, ShipIcon } from "@/components/ui/icons";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { FerryHealthRow } from "@/lib/queries";

export interface FleetOption {
  id: number;
  name: string;
  status: string;
  capacity: number;
  seatsAvailable: number;
  /** Whether the ferry shows on the passenger site. */
  inOperation: boolean;
  receivedAt: string | null;
  /**
   * The highest packet number the PC has seen from this boat.
   *
   * A packet that is not higher than this is ignored, so the number is shown
   * on the boat's card: the unit that is fitted to the boat has to start its
   * count above it.
   */
  lastSeq: number;
  /** The identity colour of the boat, a name from the shared palette. */
  color: string | null;
}

/**
 * The fleet table and the update ferry panel.
 *
 * They live together because they share one piece of state: which ferry is
 * being edited. The table and the panel are one component, so pressing
 * Edit on a row moves the panel to that ferry.
 */
export function FleetSection({
  ferries,
  canEdit,
  nextColor = "orange",
}: {
  ferries: FleetOption[];
  canEdit: boolean;
  /**
   * The colour the next boat will be given.
   *
   * The console hands a new boat the first colour nobody in the fleet is
   * using, so the form can say which colour the new boat will get before it
   * is added.
   */
  nextColor?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState(ferries[0]?.id ?? 0);

  // The update panel. Pressing Edit on a row brings it into view, so the
  // administrator never has to hunt for it down the page.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const nextColorValue = useMemo(
    () => ferryColor({ id: 0, color: nextColor }),
    [nextColor],
  );

  const selected = useMemo(
    () => ferries.find((ferry) => ferry.id === selectedId) ?? ferries[0],
    [ferries, selectedId],
  );

  // The form keeps its own copy so a half typed value is never written.
  const [capacity, setCapacity] = useState(String(selected?.capacity ?? 40));
  const [aboard, setAboard] = useState(
    String((selected?.capacity ?? 40) - (selected?.seatsAvailable ?? 0)),
  );
  const [inOperation, setInOperation] = useState(
    selected ? selected.inOperation : false,
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(
    null,
  );

  // The add form. It is a separate mode of the same card, so the console
  // keeps one place for the fleet.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("40");
  const [newInOperation, setNewInOperation] = useState(true);

  const appliedCapacity = selected ? selected.capacity : 0;
  const appliedAboard = selected ? selected.capacity - selected.seatsAvailable : 0;
  const appliedInOperation = selected ? selected.inOperation : false;

  function pick(ferry: FleetOption) {
    setSelectedId(ferry.id);
    setEditingId(ferry.id);
    setCapacity(String(ferry.capacity));
    setAboard(String(ferry.capacity - ferry.seatsAvailable));
    setInOperation(ferry.inOperation);
    setReason("");
    setMessage(null);
    // Bring the update panel into view and put the cursor in it, so the
    // administrator can carry straight on with the edit.
    scrollIntoViewNear(panelRef.current);
    selectRef.current?.focus({ preventScroll: true });
  }

  function chooseFromList(id: number) {
    const ferry = ferries.find((item) => item.id === id);
    if (!ferry) return;
    setSelectedId(id);
    setCapacity(String(ferry.capacity));
    setAboard(String(ferry.capacity - ferry.seatsAvailable));
    setInOperation(ferry.inOperation);
    setReason("");
    setMessage(null);
  }

  // The in operation switch is driven by the server, so the switch has to
  // show the answer straight away and then wait for the page to come back.
  // Without this a second click, made while the first one is still saving,
  // is swallowed and the administrator thinks the switch is stuck.
  const [pendingOperation, setPendingOperation] = useState<{
    id: number;
    inOperation: boolean;
  } | null>(null);

  async function toggleOperation(ferry: FleetOption, next: boolean) {
    setMessage(null);
    setPendingOperation({ id: ferry.id, inOperation: next });
    const result = await sendJson("/api/admin/ferries", {
      id: ferry.id,
      inOperation: next,
    });
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${ferry.name} is now ${next ? "in service" : "out of service"}.`
        : result.message,
    });
    if (result.ok) {
      announceFleetChange();
      startTransition(() => router.refresh());
    }
    setPendingOperation(null);
  }

  async function save() {
    if (!selected) return;
    setMessage(null);

    const nextCapacity = Number(capacity);
    if (!Number.isInteger(nextCapacity) || nextCapacity < 1) {
      setMessage({ tone: "bad", text: "The capacity has to be a whole number above zero." });
      return;
    }

    const nextAboard = Number(aboard);
    if (!Number.isInteger(nextAboard) || nextAboard < 0) {
      setMessage({ tone: "bad", text: "The passenger count has to be a whole number of zero or more." });
      return;
    }
    if (nextAboard > nextCapacity) {
      setMessage({ tone: "bad", text: "There cannot be more passengers than seats." });
      return;
    }

    const payload: Record<string, unknown> = { id: selected.id };
    if (nextCapacity !== appliedCapacity) payload.capacity = nextCapacity;
    if (inOperation !== appliedInOperation) payload.inOperation = inOperation;

    const seatsAvailable = nextCapacity - nextAboard;
    const appliedSeats = appliedCapacity - appliedAboard;
    if (seatsAvailable !== appliedSeats) {
      if (reason.trim().length < 3) {
        setMessage({
          tone: "bad",
          text: "A reason is required for a manual passenger count correction.",
        });
        return;
      }
      payload.seatsAvailable = seatsAvailable;
      payload.reason = reason.trim();
    }

    if (Object.keys(payload).length === 1) {
      setMessage({ tone: "bad", text: "Nothing was changed." });
      return;
    }

    const result = await sendJson("/api/admin/ferries", payload);
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok ? "Saved." : result.message,
    });
    if (result.ok) {
      setReason("");
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  function reset() {
    if (!selected) return;
    setCapacity(String(appliedCapacity));
    setAboard(String(appliedAboard));
    setInOperation(appliedInOperation);
    setReason("");
    setMessage(null);
  }

  /**
   * Remove a ferry from the fleet.
   *
   * A ferry that has been in service keeps its passenger counts and its GPS
   * history, so the server refuses to delete it. Taking it out of service is
   * the way to keep the record and hide the ferry from the passenger site.
   */
  async function removeFerry() {
    if (!selected) return;
    setMessage(null);

    const confirmed = window.confirm(
      `Remove ${selected.name} from the fleet?`,
    );
    if (!confirmed) return;

    const result = await sendJson(
      `/api/admin/ferries?id=${selected.id}`,
      {},
      "DELETE",
    );

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${selected.name} was removed from the fleet.`
        : result.message,
    });

    if (result.ok) {
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  /**
   * Add a ferry to the fleet.
   *
   * The new ferry starts with no position: it waits at the station until its
   * first GPS packet arrives. It is in service straight away unless the
   * administrator says otherwise.
   */
  async function addFerry() {
    setMessage(null);

    if (!newName.trim()) {
      setMessage({ tone: "bad", text: "The ferry needs a name." });
      return;
    }

    const nextCapacity = Number(newCapacity);
    if (!Number.isInteger(nextCapacity) || nextCapacity < 1 || nextCapacity > 500) {
      setMessage({
        tone: "bad",
        text: "The capacity has to be a whole number between 1 and 500.",
      });
      return;
    }

    const result = await sendJson(
      "/api/admin/ferries",
      {
        name: newName.trim(),
        capacity: nextCapacity,
        inOperation: newInOperation,
      },
      "POST",
    );

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${newName.trim()} was added to the fleet.`
        : result.message,
    });

    if (result.ok) {
      setNewName("");
      setNewCapacity("40");
      setNewInOperation(true);
      setAdding(false);
      announceFleetChange();
      startTransition(() => router.refresh());
    }
  }

  const estimatedSeats = Math.max(
    0,
    (Number.isInteger(Number(capacity)) ? Number(capacity) : appliedCapacity) -
      (Number.isInteger(Number(aboard)) ? Number(aboard) : appliedAboard),
  );

  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader
          title="Ferry management"
          align="start"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
                {ferries.filter((ferry) =>
                  pendingOperation?.id === ferry.id
                    ? pendingOperation.inOperation
                    : ferry.inOperation,
                ).length}{" "}
                of {ferries.length} in the fleet
              </span>
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
                title="Add a ferry to the fleet"
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
                  adding
                    ? "border-brand-500 bg-brand-500 text-white hover:bg-brand-600"
                    : "border-line bg-white text-ink-strong hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                <PlusIcon />
                {adding ? "Cancel" : "Add ferry"}
              </button>
            </div>
          }
        />

        {/* The table when there is room for it, the cards when there is not. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-[#fafcfc] text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Ferry</th>
                <th scope="col" className="px-4 py-3 font-semibold">Aboard</th>
                <th scope="col" className="px-4 py-3 font-semibold">Seats free</th>
                <th scope="col" className="px-4 py-3 font-semibold">In operation</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Control</th>
              </tr>
            </thead>
            <tbody>
              {ferries.map((ferry) => {
                const ferryAboard = ferry.capacity - ferry.seatsAvailable;
                const isEditing = editingId === ferry.id;
                const shownOperation =
                  pendingOperation?.id === ferry.id
                    ? pendingOperation.inOperation
                    : ferry.inOperation;
                return (
                  <tr
                    key={ferry.id}
                    className={`border-b border-line last:border-0 ${
                      isEditing ? "bg-brand-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                          style={{ backgroundColor: ferryColor(ferry).hex }}
                          aria-hidden="true"
                        >
                          {ferry.id}
                        </span>
                        <span>
                          <span className="block font-medium text-ink-strong">
                            {ferry.name}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {statusLabel(ferry.status)}
                          </span>
                          {/* The identity colour of the boat, so the
                              administrator can see at a glance which boat is
                              which on the passenger site. */}
                          <span
                            className="block text-xs font-medium"
                            style={{ color: ferryColor(ferry).textHex }}
                          >
                            {ferryColor(ferry).label}
                          </span>
                          {/* Why the passenger site may not show this boat. */}
                          {!shownOperation ? (
                            <span className="block text-xs text-ink-faint">
                              Hidden from the passenger site
                            </span>
                          ) : ferry.receivedAt === null ? (
                            <span className="block text-xs text-ink-faint">
                              Waiting for its first GPS packet
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-strong">
                      {ferryAboard}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {`${ferry.seatsAvailable} / ${ferry.capacity}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={shownOperation}
                          onChange={(next) => toggleOperation(ferry, next)}
                          label={`${ferry.name} in operation`}
                          disabled={!canEdit || pendingOperation !== null}
                        />
                        <span className="text-xs text-ink-muted">
                          {shownOperation ? "On" : "Off"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => pick(ferry)}
                        disabled={!canEdit}
                        className={`inline-flex min-h-[40px] items-center rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
                          isEditing
                            ? "bg-brand-500 text-white hover:bg-brand-600"
                            : "border border-line bg-white text-ink-strong hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                        }`}
                      >
                        {isEditing ? "Editing" : "Edit ferry"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line md:hidden">
          {ferries.map((ferry) => {
            const ferryAboard = ferry.capacity - ferry.seatsAvailable;
            const isEditing = editingId === ferry.id;
            const shownOperation =
              pendingOperation?.id === ferry.id
                ? pendingOperation.inOperation
                : ferry.inOperation;
            return (
              <li key={ferry.id} className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                    style={{ backgroundColor: ferryColor(ferry).hex }}
                    aria-hidden="true"
                  >
                    {ferry.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-strong">
                      {ferry.name}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {statusLabel(ferry.status)}
                    </span>
                    <span
                      className="block text-xs font-medium"
                      style={{ color: ferryColor(ferry).textHex }}
                    >
                      {ferryColor(ferry).label}
                    </span>
                  </span>
                  <Toggle
                    checked={shownOperation}
                    onChange={(next) => toggleOperation(ferry, next)}
                    label={`${ferry.name} in operation`}
                    disabled={!canEdit || pendingOperation !== null}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">
                    {shownOperation
                      ? `${ferryAboard} aboard · ${ferry.seatsAvailable} seats free`
                      : "Not available to passengers"}
                  </span>
                  <button
                    type="button"
                    onClick={() => pick(ferry)}
                    disabled={!canEdit}
                    className={`inline-flex min-h-[40px] items-center rounded-xl px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
                      isEditing
                        ? "bg-brand-500 text-white"
                        : "border border-line bg-white text-brand-700 hover:bg-brand-50"
                    }`}
                  >
                    {isEditing ? "Editing" : "Edit →"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div ref={panelRef} className="min-w-0">
        <Card className="min-w-0">
          <CardHeader
            title={adding ? "Add a ferry" : "Update ferry"}
            description={
              !canEdit && !adding
                ? "Read only · Only the head administrator can change a ferry"
                : undefined
            }
          />

          {adding ? (
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Ferry name
                </p>
                <input
                  ref={nameRef}
                  type="text"
                  maxLength={80}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="For example: Ferry 5"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Capacity
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={newCapacity}
                    onChange={(event) => setNewCapacity(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
                    seats
                  </span>
                </div>
              </div>

              {/*
                There is no trip status to choose here. Nobody at the station
                can know whether a boat is boarding while it is on its way, so
                the status is worked out from the boat's own packets instead.
              */}
              <div className="rounded-xl border border-line bg-page px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Trip status
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  Not a choice. The database works the status out from the
                  boat&apos;s own packets, so nobody has to guess it and the
                  passenger site cannot be told something different. A new boat
                  waits at the first station and shows as docked until it
                  reports.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    In service
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Visible in the passenger dashboard
                  </p>
                </div>
                <Toggle
                  checked={newInOperation}
                  onChange={setNewInOperation}
                  label="The new ferry is in service"
                />
              </div>

              {/*
                The colour the new boat will be given. The console hands a new
                boat the first colour nobody in the fleet is using, so two boats
                can never be told apart by their colour alone.
              */}
              <div className="flex items-center gap-3 rounded-xl border border-line bg-page px-3 py-2.5">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: nextColorValue.hex }}
                  aria-hidden="true"
                >
                  <ShipIcon className="h-4 w-4" />
                </span>
                <p className="text-xs leading-relaxed text-ink-muted">
                  This ferry will be{" "}
                  <span
                    className="font-semibold"
                    style={{ color: nextColorValue.textHex }}
                  >
                    {nextColorValue.label}
                  </span>
                  . A new boat takes the first colour nobody in the fleet is using.
                </p>
              </div>

              <p className="text-xs leading-relaxed text-ink-faint">
                A new ferry starts at the first station on the route, so it is on
                the line straight away. It has not sent a GPS packet yet, and it
                shows on the passenger site as soon as it is in service.
              </p>

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
                  onClick={addFerry}
                  disabled={pending}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {pending ? "Adding..." : "Add the ferry"}
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
            <p className="px-5 py-6 text-sm text-ink-muted">There are no ferries yet.</p>
          ) : (
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Selected ferry
                </p>
                <select
                  ref={selectRef}
                  value={String(selectedId)}
                  onChange={(event) => chooseFromList(Number(event.target.value))}
                  disabled={!canEdit}
                  className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink disabled:text-ink-faint"
                >
                  {ferries.map((ferry) => (
                    <option key={ferry.id} value={ferry.id}>
                      {ferry.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Capacity
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    disabled={!canEdit}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 pr-16 text-sm text-ink disabled:text-ink-faint"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
                    seats
                  </span>
                </div>
              </div>

              {/*
                The trip status is read, never written. The database works it
                out from the boat's own packets, so there is nothing here to
                change and nothing to get wrong.
              */}
              <div className="rounded-xl border border-line bg-page px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Trip status
                  </p>
                  <span className="text-sm font-medium text-ink-strong">
                    {statusLabel(selected.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  Worked out from the boat&apos;s own packets, so it cannot be
                  set by hand. The live preview says when the boat is due at
                  the next station.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Passengers aboard
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  Based on ferry worker observations
                </p>
                <div className="mt-2">
                  <Stepper
                    value={Number.isInteger(Number(aboard)) ? Number(aboard) : appliedAboard}
                    onChange={(next) => setAboard(String(next))}
                    min={0}
                    max={Number(capacity) || 500}
                    label="passenger"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
                      Estimated seats available
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {capacity || 0} capacity → {aboard || 0} passengers
                    </p>
                  </div>
                  <p className="text-3xl font-semibold tracking-tight text-brand-600">
                    {estimatedSeats}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    In operation
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Visible in the passenger dashboard
                  </p>
                </div>
                <Toggle
                  checked={inOperation}
                  onChange={setInOperation}
                  label={`${selected.name} in operation`}
                  disabled={!canEdit}
                />
              </div>

              {Number(aboard) !== appliedAboard ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Reason for the correction
                  </p>
                  <input
                    type="text"
                    maxLength={300}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="For example: counted the passengers again at the gate"
                    className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint"
                  />
                  <p className="mt-1 text-xs text-ink-faint">
                    A manual count always needs a reason. It is kept in the
                    activity log.
                  </p>
                </div>
              ) : null}

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
                  {pending ? "Saving..." : "Save changes"}
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
                onClick={removeFerry}
                disabled={!canEdit || pending}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#f3d3d1] bg-white px-4 text-sm font-medium text-[#8f2c24] transition-colors hover:bg-[#fdeceb] disabled:text-ink-faint"
              >
                Remove this ferry from the fleet
              </button>

              <p className="text-xs leading-relaxed text-ink-faint">
                Last packet <RelativeTime iso={selected.receivedAt} />
              </p>
              <p className="text-xs leading-relaxed text-ink-faint">
                Packet number {selected.lastSeq}. Start the unit above this
                number; if it starts below, the port station corrects it.
              </p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

/**
 * The trip status of a boat, as the database worked it out.
 *
 * The status is not something an administrator sets, so the wording comes
 * from the shared list and is never written twice.
 */
function statusLabel(status: string): string {
  return STATUS_LABELS[status as FerryStatus] ?? "Unknown";
}
