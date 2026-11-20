import bcrypt from "bcryptjs";
import { createUserSchema, updateUserSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { fail, firstIssue, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { canManageAllAccounts } from "@/lib/mode";
import { getUsers } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The account list, without any password hash. */
export async function GET() {
  const users = await getUsers();
  return ok({ users });
}

/**
 * Create an account.
 *
 * An account is a username and a password. The admin app is private to the
 * station network, so there is no email address and no password reset by mail.
 *
 * Only the master administrator can create an account. A station
 * administrator can add another account for its own station, and the database
 * trigger refuses anything else even if this route is bypassed.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  const body = await readJson(request);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { username, name, role, stationId, password } = parsed.data;
  const cleanUsername = username.trim().toLowerCase();

  const isManager = canManageAllAccounts(user.role);
  if (!isManager && role !== "STAFF") {
    return fail("Only the master administrator can create an administrator account", 403);
  }

  if (role === "STAFF" && !stationId) {
    return fail("A station account must be assigned to a station", 400);
  }

  // A station account may only add people to its own station.
  if (!isManager && stationId !== user.stationId) {
    return fail("You can only create accounts for your own station", 403);
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM "User" WHERE lower(username) = lower($1)`,
    [cleanUsername],
  );
  if (existing) return fail("That username is already taken", 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const created = await queryOne<{ id: number }>(
    `INSERT INTO "User" (username, name, "passwordHash", role, "stationId", "isActive")
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id`,
    [cleanUsername, name, passwordHash, role, stationId ?? null],
  );

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "ACCOUNT_CREATED",
    entityType: "User",
    entityId: created?.id ?? null,
    details: { username: cleanUsername, name, role, stationId: stationId ?? null },
  });

  return ok({ id: created?.id ?? null }, { status: 201 });
}

/**
 * Update an account: rename it, move it to another station, change its role,
 * enable or disable it, or reset its password.
 *
 * A station account may only manage the other accounts of its own station. It
 * can never change a role, and it can never touch the master administrator.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  const body = await readJson(request);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { id, username, name, isActive, role, stationId, password } = parsed.data;

  if (
    username === undefined &&
    name === undefined &&
    isActive === undefined &&
    role === undefined &&
    stationId === undefined &&
    password === undefined
  ) {
    return fail("Nothing to change", 400);
  }

  const target = await queryOne<{
    id: number;
    username: string;
    name: string;
    role: string;
    stationId: number | null;
    isActive: boolean;
  }>(
    `SELECT id, username, name, role, "stationId", "isActive" FROM "User" WHERE id = $1`,
    [id],
  );
  if (!target) return fail("Unknown account", 404);

  const isManager = canManageAllAccounts(user.role);

  if (!isManager) {
    // A station account may only manage the other accounts of its own
    // station, and it can never change a role.
    if (target.role !== "STAFF") {
      return fail("You can only manage the accounts of your own station", 403);
    }
    if (target.stationId !== user.stationId) {
      return fail("You can only manage the accounts of your own station", 403);
    }
    if (role !== undefined) {
      return fail("Only the master administrator can change the role of an account", 403);
    }
    if (stationId !== undefined && stationId !== user.stationId) {
      return fail("You can only manage accounts at your own station", 403);
    }
  }

  // The master administrator should not be able to lock themselves out.
  if (String(target.id) === String(user.id)) {
    if (isActive === false) {
      return fail("You cannot disable your own account", 409);
    }
    if (role !== undefined && role !== "ADMIN") {
      return fail("You cannot change your own role", 409);
    }
  }

  if (role === "STAFF" && stationId === null) {
    return fail("A station account must be assigned to a station", 400);
  }

  let cleanUsername: string | null = null;
  if (username !== undefined) {
    cleanUsername = username.trim().toLowerCase();
    const taken = await queryOne<{ id: number }>(
      `SELECT id FROM "User" WHERE lower(username) = lower($1) AND id <> $2`,
      [cleanUsername, id],
    );
    if (taken) return fail("That username is already taken", 409);
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  await query(
    `UPDATE "User"
     SET username = COALESCE($2, username),
         name = COALESCE($3, name),
         "isActive" = COALESCE($4, "isActive"),
         role = COALESCE($5, role),
         "stationId" = CASE WHEN $6::boolean THEN $7 ELSE "stationId" END,
         "passwordHash" = COALESCE($8, "passwordHash"),
         "failedLogins" = CASE WHEN $8::text IS NULL THEN "failedLogins" ELSE 0 END,
         "lockedUntil" = CASE WHEN $8::text IS NULL THEN "lockedUntil" ELSE NULL END,
         "updatedAt" = now()
     WHERE id = $1`,
    [
      id,
      cleanUsername,
      name ?? null,
      isActive ?? null,
      role ?? null,
      stationId !== undefined,
      stationId ?? null,
      passwordHash,
    ],
  );

  const changes: string[] = [];
  if (username !== undefined) changes.push(`username to ${cleanUsername}`);
  if (name !== undefined) changes.push(`name to ${name}`);
  if (isActive !== undefined) changes.push(isActive ? "enabled" : "disabled");
  if (role !== undefined) changes.push(`role to ${role}`);
  if (stationId !== undefined) changes.push(`station to ${stationId}`);
  if (password !== undefined) changes.push("password reset");

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: isActive === false ? "ACCOUNT_DISABLED" : "ACCOUNT_UPDATED",
    entityType: "User",
    entityId: id,
    details: { changes, account: target.username },
  });

  return ok({ id });
}

/**
 * Remove an account.
 *
 * Only the master administrator may do this, and never on its own account.
 * The rows that belong to the account, the passenger events it counted and
 * the activity it wrote, stay behind: the audit trail has to survive.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  if (!canManageAllAccounts(user.role)) {
    return fail("Only the master administrator can remove an account", 403);
  }

  const body = await readJson(request);
  const id = Number((body as { id?: unknown } | null)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail("Which account?", 400);
  }

  if (String(id) === String(user.id)) {
    return fail("You cannot remove your own account", 409);
  }

  const target = await queryOne<{ id: number; username: string; name: string }>(
    `SELECT id, username, name FROM "User" WHERE id = $1`,
    [id],
  );
  if (!target) return fail("Unknown account", 404);

  await query(`DELETE FROM "User" WHERE id = $1`, [id]);

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "ACCOUNT_REMOVED",
    entityType: "User",
    entityId: id,
    details: { account: target.username, name: target.name },
  });

  return ok({ id });
}
