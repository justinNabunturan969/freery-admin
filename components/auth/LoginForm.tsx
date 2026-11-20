"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";

/**
 * The sign in form.
 *
 * The server checks the password with bcrypt, and the server decides what
 * the account is allowed to see. Nothing here decides permissions.
 */
export function LoginForm({
  error,
  callbackUrl,
  mode,
}: {
  error?: string;
  callbackUrl?: string;
  mode: "admin" | "counter";
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(error ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        redirectTo: callbackUrl ?? "/",
      });

      if (result?.error) {
        setMessage(
          "Sign in failed. Check the username and password, then try again. Five failed attempts lock the account for 15 minutes.",
        );
        setPending(false);
        return;
      }

      router.push(callbackUrl ?? "/");
      router.refresh();
    } catch {
      setMessage("Sign in failed. Check the username and password, then try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {message ? (
        <div
          role="alert"
          className="rounded-xl border border-[#f3d3d1] bg-[#fdeceb] px-4 py-3 text-sm leading-relaxed text-[#8f2c24]"
        >
          {message}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="username"
          className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          Username
        </label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="admin"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full"
      >
        {pending
          ? "Signing in..."
          : mode === "counter"
            ? "Open the counter"
            : "Sign in"}
      </Button>
    </form>
  );
}
