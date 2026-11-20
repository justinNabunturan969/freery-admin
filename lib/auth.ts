import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { UserRole } from "@freery/shared";
import { authConfig } from "@/lib/auth.config";
import { query, queryOne } from "@/lib/db";
import { logActivitySafe } from "@/lib/audit";

/**
 * Auth.js with a credentials login.
 *
 * Passwords are bcrypt hashes. Repeated failures lock the account for a
 * while, and a disabled account can never sign in. The role is copied into
 * the token so every route can check it on the server.
 */

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface UserRow {
  id: number;
  username: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  stationId: number | null;
  isActive: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Freery",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        const user = await queryOne<UserRow>(
          `SELECT id, username, name, "passwordHash", role, "stationId", "isActive",
                  "failedLogins", "lockedUntil"
           FROM "User" WHERE lower(username) = $1`,
          [username],
        );

        if (!user) return null;
        if (!user.isActive) return null;
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return null;

        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) {
          const failed = user.failedLogins + 1;
          const locked = failed >= MAX_FAILED_LOGINS;
          await query(
            `UPDATE "User"
             SET "failedLogins" = $1,
                 "lockedUntil" = $2,
                 "updatedAt" = now()
             WHERE id = $3`,
            [failed, locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null, user.id],
          );
          return null;
        }

        await query(
          `UPDATE "User"
           SET "failedLogins" = 0, "lockedUntil" = NULL, "updatedAt" = now()
           WHERE id = $1`,
          [user.id],
        );

        // The sign in is written to the audit log, so the sessions page can
        // show who is online. The station role has no write right on the
        // activity log, so a failure here must never block the sign in.
        await logActivitySafe({
          userId: user.id,
          userName: user.name,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
        });

        return {
          id: String(user.id),
          username: user.username,
          name: user.name,
          role: user.role,
          stationId: user.stationId,
        };
      },
    }),
  ],
  callbacks: {
    // The token and session callbacks come from the edge safe config, so
    // the middleware sees the same role the route handlers see.
    ...authConfig.callbacks,
  },
});
