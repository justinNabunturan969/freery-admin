import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink-strong">
          Not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          This route does not exist in this mode of the Freery admin app.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Go back
        </Link>
      </div>
    </main>
  );
}
