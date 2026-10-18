"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

export function AuthForm({
  mode,
  googleEnabled,
  restricted = true,
}: {
  mode: "login" | "register";
  googleEnabled: boolean;
  restricted?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    try {
      const result =
        mode === "register"
          ? await authClient.signUp.email({
              email,
              password,
              name: String(form.get("name")).trim(),
              callbackURL: "/app",
            })
          : await authClient.signIn.email({
              email,
              password,
              callbackURL: "/app",
            });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : result.error.status === 403
              ? "This account is not approved for tester access."
              : mode === "register"
                ? "We couldn’t create your account. Check your details or try signing in."
                : "We couldn’t sign you in. Check your email and password.",
        );
      } else {
        router.replace("/app");
        router.refresh();
      }
    } catch {
      setError("Couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/app",
        errorCallbackURL: "/login?error=oauth",
      });
      if (result.error) {
        setError(
          "Google sign-in failed. Check your tester access or use email and password.",
        );
        setBusy(false);
      }
    } catch {
      setError("Couldn’t connect to Google. Please try again.");
      setBusy(false);
    }
  }
  const field =
    "mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 outline-offset-4";
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-emerald-800">
        REMINDME
      </Link>
      <h1 className="mt-10 text-3xl font-semibold">
        {mode === "register" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-3 text-stone-600">
        {restricted
          ? "Access is currently limited to approved testers."
          : "Your reminders start with an account."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {mode === "register" && (
          <label className="block">
            Name
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              className={field}
            />
          </label>
        )}
        <label className="block">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={field}
          />
        </label>
        <label className="block">
          Password
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "register" ? 12 : undefined}
            maxLength={128}
            className={field}
          />
        </label>
        {mode === "register" && (
          <p className="text-sm text-stone-600">
            Use 12–128 characters. Email verification and password recovery are
            not available in this early version.
          </p>
        )}
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
        <button
          disabled={busy}
          className="w-full rounded-lg bg-emerald-900 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      {googleEnabled && (
        <button
          disabled={busy}
          onClick={google}
          className="mt-4 w-full rounded-lg border border-stone-300 px-4 py-3 disabled:opacity-50"
        >
          Continue with Google
        </button>
      )}
      <p className="mt-6 text-sm text-stone-600">
        {mode === "register" ? "Already registered? " : "Need an account? "}
        <Link
          className="underline"
          href={mode === "register" ? "/login" : "/register"}
        >
          {mode === "register" ? "Sign in" : "Register"}
        </Link>
      </p>
    </main>
  );
}
