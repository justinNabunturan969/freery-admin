import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { MODE } from "@/lib/mode";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignOutButton } from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const counter = MODE === "counter";

  /*
   * A station account that is signed in on the head station console.
   *
   * The console belongs to the master administrator, so the pages send a
   * station account back here. This says so plainly, and gives the way
   * forward, instead of leaving the person on a page that keeps reloading
   * with no explanation.
   */
  const session = await auth();
  const account = session?.user;
  const wrongConsole =
    !counter && Boolean(account) && account?.role !== "ADMIN";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src="/logo/freery-logo.svg"
            alt="Freery"
            width={132}
            height={32}
            className="mx-auto h-8 w-auto"
          />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink-strong">
            {counter ? "Freery passenger counter" : "Freery admin console"}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {counter
              ? "Station staff sign in to count passengers at their own station."
              : "Head station sign in to manage ferries, stations, accounts and logs."}
          </p>
        </div>

        {wrongConsole ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-[#f3d3d1] bg-[#fdeceb] p-5 text-sm leading-relaxed text-[#8f2c24]"
          >
            <p className="font-semibold">
              This console is for the master administrator.
            </p>
            <p className="mt-1.5">
              You are signed in as{" "}
              <strong>{account?.username ?? "a station account"}</strong>. Station
              accounts sign in to the station app on their own station, not to
              this console. Sign in with the master administrator account below,
              or sign out first.
            </p>
            <div className="mt-3">
              <SignOutButton label="Sign out" />
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <LoginForm
            error={error}
            callbackUrl={callbackUrl}
            mode={counter ? "counter" : "admin"}
          />
        </div>
      </div>
    </main>
  );
}
