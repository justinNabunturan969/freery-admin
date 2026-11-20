import type { DefaultSession } from "next-auth";
import type { UserRole } from "@freery/shared";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: UserRole;
      stationId: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    role: UserRole;
    stationId: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: UserRole;
    stationId?: number | null;
  }
}
