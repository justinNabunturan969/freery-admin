import { signOutAction } from "@/app/actions/sign-out";

/**
 * The sign out control.
 *
 * The action lives in app/actions/sign-out.ts, so this button can be used
 * from a server component and from the account menu in the top bar.
 */
export function SignOutButton({
  className = "",
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 ${className}`}
      >
        {label}
      </button>
    </form>
  );
}
