import type { Metadata } from "next";
import { MODE } from "@/lib/mode";
import { LoginForm } from "@/components/auth/LoginForm";

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
