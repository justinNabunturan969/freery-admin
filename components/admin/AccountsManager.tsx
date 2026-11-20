"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "@/lib/client";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { formatDate, formatTime } from "@/components/ui/stats";

export interface AccountRow {
  id: number;
  username: string;
  name: string;
  role: string;
  stationId: number | null;
  stationName: string | null;
  isActive: boolean;
  lastLogin: string | null;
}

export interface StationOption {
  id: number;
  name: string;
}

/**
 * The accounts screen.
 *
 * The master administrator creates, edits, disables and removes the station
 * administrator accounts. Every change is written to the audit log.
 */
export function AccountsManager({
  users,
  stations,
  ownUserId,
  viewerRole,
  viewerStationId,
}: {
  users: AccountRow[];
  stations: StationOption[];
  ownUserId: string;
  viewerRole: string;
  viewerStationId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const isManager = viewerRole === "ADMIN";
  const visibleUsers = isManager
    ? users
    : users.filter(
        (user) => user.role === "STAFF" && user.stationId === viewerStationId,
      );

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [stationId, setStationId] = useState(
    String(stations[0]?.id ?? viewerStationId ?? ""),
  );
  const [password, setPassword] = useState("");

  // Edit form state.
  const [editUsername, setEditUsername] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("STAFF");
  const [editStationId, setEditStationId] = useState("");
  const [editPassword, setEditPassword] = useState("");

  function beginEdit(user: AccountRow) {
    setEditingId(user.id);
    setEditUsername(user.username);
    setEditName(user.name);
    setEditRole(user.role);
    setEditStationId(String(user.stationId ?? ""));
    setEditPassword("");
    setShowCreate(false);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPassword("");
  }

  async function createAccount() {
    setMessage(null);
    if (!username.trim() || !name.trim() || password.length < 8) {
      setMessage({
        tone: "bad",
        text: "A username, a name and a password of at least 8 characters are needed.",
      });
      return;
    }
    if (role === "STAFF" && !stationId) {
      setMessage({ tone: "bad", text: "A station account needs a station." });
      return;
    }

    const result = await sendJson(
      "/api/admin/users",
      {
        username: username.trim(),
        name: name.trim(),
        role,
        stationId: role === "STAFF" ? Number(stationId) : null,
        password,
      },
      "POST",
    );

    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok ? "The account was created." : result.message,
    });
    if (result.ok) {
      setUsername("");
      setName("");
      setPassword("");
      setRole("STAFF");
      setShowCreate(false);
      startTransition(() => router.refresh());
    }
  }

  async function saveEdit(user: AccountRow) {
    setMessage(null);
    const payload: Record<string, unknown> = { id: user.id };
    const nextUsername = editUsername.trim().toLowerCase();
    if (nextUsername && nextUsername !== user.username) {
      payload.username = nextUsername;
    }
    if (editName.trim() && editName.trim() !== user.name) {
      payload.name = editName.trim();
    }
    if (isManager && editRole !== user.role) {
      payload.role = editRole;
    }
    const nextStation =
      editRole === "STAFF" && editStationId ? Number(editStationId) : null;
    if (editRole === "STAFF" && !editStationId) {
      setMessage({ tone: "bad", text: "A station account needs a station." });
      return;
    }
    if (nextStation !== user.stationId) {
      payload.stationId = nextStation;
    }
    if (editPassword) {
      if (editPassword.length < 8) {
        setMessage({
          tone: "bad",
          text: "The password must be at least 8 characters.",
        });
        return;
      }
      payload.password = editPassword;
    }

    if (Object.keys(payload).length === 1) {
      setMessage({ tone: "bad", text: "Nothing was changed." });
      return;
    }

    const result = await sendJson("/api/admin/users", payload, "PATCH");
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok ? `The account for ${user.name} was updated.` : result.message,
    });
    if (result.ok) {
      setEditingId(null);
      setEditPassword("");
      startTransition(() => router.refresh());
    }
  }

  async function toggleActive(user: AccountRow) {
    setMessage(null);
    const result = await sendJson("/api/admin/users", {
      id: user.id,
      isActive: !user.isActive,
    });
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok
        ? `${user.name} was ${user.isActive ? "disabled" : "enabled"}.`
        : result.message,
    });
    if (result.ok) startTransition(() => router.refresh());
  }

  async function removeAccount(user: AccountRow) {
    const confirmed = window.confirm(
      `Remove the account ${user.username}? The passenger events and activity it recorded will stay.`,
    );
    if (!confirmed) return;
    setMessage(null);
    const result = await sendJson("/api/admin/users", { id: user.id }, "DELETE");
    setMessage({
      tone: result.ok ? "good" : "bad",
      text: result.ok ? `${user.name} was removed.` : result.message,
    });
    if (result.ok) startTransition(() => router.refresh());
  }

  function roleLabel(value: string): string {
    if (value === "ADMIN") return "Master administrator";
    return "Station administrator";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isManager ? (
          <Button
            variant="primary"
            onClick={() => {
              setShowCreate((value) => !value);
              setEditingId(null);
            }}
          >
            {showCreate ? "Cancel" : "Create an account"}
          </Button>
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
      </div>

      {isManager && showCreate ? (
        <div className="rounded-2xl border border-line bg-page p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" htmlFor="account-username">
              <Input
                id="account-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="station1"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label="Name" htmlFor="account-name">
              <Input
                id="account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Station 1 administrator"
              />
            </Field>
            <Field label="Role" htmlFor="account-role">
              <Select
                id="account-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="STAFF">Station administrator</option>
                <option value="ADMIN">Master administrator</option>
              </Select>
            </Field>
            <Field
              label="Station"
              htmlFor="account-station"
              hint="A station administrator counts at their assigned station."
            >
              <Select
                id="account-station"
                value={stationId}
                onChange={(event) => setStationId(event.target.value)}
                disabled={role !== "STAFF"}
              >
                <option value="">No station</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Password"
              htmlFor="account-password"
              hint="At least 8 characters. Stored as a bcrypt hash."
            >
              <Input
                id="account-password"
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
          </div>
          <Button variant="primary" onClick={createAccount} className="mt-4" disabled={pending}>
            Create the account
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleUsers.map((user) => {
          const isOwn = String(user.id) === ownUserId;
          const isEditing = editingId === user.id;
          return (
            <div
              key={user.id}
              className="rounded-2xl border border-line bg-white p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-strong">{user.name}</p>
                  <p className="text-xs text-ink-muted">@{user.username}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Role</dt>
                  <dd className="mt-0.5 text-ink-strong">{roleLabel(user.role)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Station</dt>
                  <dd className="mt-0.5 text-ink-strong">{user.stationName ?? "Not assigned"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Last sign in</dt>
                  <dd className="mt-0.5 text-ink-strong">
                    {user.lastLogin
                      ? `${formatDate(user.lastLogin)} · ${formatTime(user.lastLogin)}`
                      : "Never"}
                  </dd>
                </div>
              </dl>

              {isEditing ? (
                <div className="mt-4 rounded-xl border border-line bg-page p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Username" htmlFor={`edit-username-${user.id}`}>
                      <Input
                        id={`edit-username-${user.id}`}
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="Name" htmlFor={`edit-name-${user.id}`}>
                      <Input
                        id={`edit-name-${user.id}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </Field>
                    <Field label="Role" htmlFor={`edit-role-${user.id}`}>
                      <Select
                        id={`edit-role-${user.id}`}
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        disabled={!isManager || isOwn}
                      >
                        <option value="STAFF">Station administrator</option>
                        <option value="ADMIN">Master administrator</option>
                      </Select>
                    </Field>
                    <Field label="Station" htmlFor={`edit-station-${user.id}`}>
                      <Select
                        id={`edit-station-${user.id}`}
                        value={editStationId}
                        onChange={(e) => setEditStationId(e.target.value)}
                        disabled={editRole !== "STAFF"}
                      >
                        <option value="">No station</option>
                        {stations.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="New password" htmlFor={`edit-pass-${user.id}`} hint="Leave blank to keep the current password.">
                      <Input
                        id={`edit-pass-${user.id}`}
                        type="text"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Leave blank to keep"
                      />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => saveEdit(user)} disabled={pending}>
                      Save changes
                    </Button>
                    <Button variant="secondary" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => beginEdit(user)}
                    className="px-3 text-xs"
                    disabled={!isManager}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={user.isActive ? "secondary" : "primary"}
                    onClick={() => toggleActive(user)}
                    disabled={isOwn || !isManager}
                    className="px-3 text-xs"
                  >
                    {user.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => removeAccount(user)}
                    disabled={isOwn || !isManager}
                    className="px-3 text-xs"
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
