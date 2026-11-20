"use server";

import { auth, signOut } from "@/lib/auth";
import { logActivitySafe } from "@/lib/audit";

/**
 * The sign out action.
 *
 * It lives in its own file so it can be used from a server component and
 * from a client component, the account menu in the top bar.
 */
export async function signOutAction(): Promise<void> {
  const session = await auth();
  const user = session?.user;

  if (user) {
    await logActivitySafe({
      userId: Number(user.id),
      userName: user.name ?? null,
      action: "LOGOUT",
      entityType: "User",
      entityId: Number(user.id),
    });
  }

  await signOut({ redirectTo: "/login" });
}
