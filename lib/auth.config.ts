import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@freery/shared";

/**
 * The edge safe half of the auth setup.
 *
 * Middleware cannot import the database driver, so the credentials provider
 * lives in lib/auth.ts. Everything else lives here, including the token and
 * the session callbacks.
 *
 * The session callbacks have to be here and not only in lib/auth.ts. The
 * middleware builds its own session from the same token, and if it does not
 * know how to copy the role onto the session, the middleware cannot see who
 * is signed in and every role check there fails.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    /** Copy the account details onto the token when the user signs in. */
    jwt({ token, user }) {
      if (user) {
        token.id = String(user.id);
        token.username = user.username;
        token.role = user.role as UserRole;
        token.stationId = (user.stationId ?? null) as number | null;
      }
      return token;
    },
    /** Copy them back onto the session, so every route can read them. */
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.username = String(token.username ?? "");
        session.user.role = (token.role ?? "STAFF") as UserRole;
        session.user.stationId = (token.stationId ?? null) as number | null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
