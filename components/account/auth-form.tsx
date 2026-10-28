"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { browserSupabase } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/auth/navigation";
import { useAccount } from "./provider";
export function AuthForm({
  mode,
}: {
  mode: "login" | "signup" | "forgot" | "reset";
}) {
  const router = useRouter();
  const { user, loading, configured } = useAccount();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('error')==='expired-link')queueMicrotask(()=>setError('This email link is invalid or expired. Request a new verification or recovery email.'))},[]);
  const signup = mode === "signup",
    forgot = mode === "forgot",
    reset = mode === "reset";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next = safeNextPath(
      new URLSearchParams(window.location.search).get("next"),
    );
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);
    try {
      if ((signup || reset) && password !== data.get("confirm"))
        throw new Error("Passwords do not match.");
      if (signup) {
        const { data: result, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callback.href,
            data: {
              display_name: String(data.get("name") ?? "")
                .trim()
                .slice(0, 80),
            },
          },
        });
        if (error) throw error;
        if (result.session) {
          router.replace(next);
          router.refresh();
        } else
          setMessage(
            "Check your inbox for a verification link. If this address is already registered, sign in or reset your password.",
          );
      } else if (forgot) {
        callback.searchParams.set("next", "/reset-password");
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: callback.href,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for this address, a recovery email will arrive. Follow its link in this browser to choose a new password.",
        );
      } else if (reset) {
        if (!user) throw new Error("Open a valid recovery link first.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Your password was updated.");
        router.replace("/dashboard");
        router.refresh();
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = "mt-2 h-11 w-full rounded-xl border border-slate-200 px-3";
  return (
    <>
      <p className="text-sm font-semibold text-blue-600">
        {forgot || reset ? "Account recovery" : "Econtent by PCGH"}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        {signup
          ? "Create your free account"
          : forgot
            ? "Forgot your password?"
            : reset
              ? "Set a new password"
              : "Welcome back"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        {signup
          ? "Save your editing settings securely. Original videos stay on your device."
          : forgot
            ? "Enter your email to request a recovery link."
            : reset
              ? "Choose a new password with at least 12 characters."
              : "Sign in to your creative workspace."}
      </p>
      {!configured && (
        <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm">
          Cloud accounts are not configured in this environment. Guest editing
          is available.
        </p>
      )}
      {reset && !loading && !user && (
        <p role="alert" className="mt-4 text-red-700">
          This recovery session is missing or expired.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900"
        >
          {message}
        </p>
      )}
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <fieldset
          disabled={busy || !configured || (reset && (loading || !user))}
          className="contents"
        >
          {signup && (
            <label className="text-sm font-medium">
              Full name
              <input
                name="name"
                required
                maxLength={80}
                autoComplete="name"
                className={field}
              />
            </label>
          )}
          {!reset && (
            <label className="text-sm font-medium">
              Email address
              <input
                name="email"
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                className={field}
              />
            </label>
          )}
          {!forgot && (
            <label className="text-sm font-medium">
              {reset ? "New password" : "Password"}
              <span className="relative block">
                <input
                  name="password"
                  aria-label={reset ? "New password" : "Password"}
                  required
                  type={show ? "text" : "password"}
                  minLength={signup || reset ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    signup || reset ? "new-password" : "current-password"
                  }
                  className={field + " pr-20"}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-5 text-xs font-semibold text-blue-600"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          )}
          {(signup || reset) && (
            <label className="text-sm font-medium">
              Confirm password
              <input
                name="confirm"
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                className={field}
              />
            </label>
          )}
          {!signup && !forgot && !reset && (
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-blue-600"
            >
              Forgot password?
            </Link>
          )}
          <Button type="submit" size="lg" className="mt-2 w-full">
            {busy
              ? "Please wait…"
              : signup
                ? "Create account"
                : forgot
                  ? "Send recovery link"
                  : reset
                    ? "Reset password"
                    : "Sign in"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </fieldset>
        {!forgot && !reset && (
          <Button type="button" variant="outline" disabled>
            Google login unavailable
          </Button>
        )}
      </form>
      <p className="mt-6 text-sm text-slate-500">
        {signup ? "Already have an account?" : "New to Econtent?"}{" "}
        <Link
          href={signup ? "/login" : "/signup"}
          className="font-semibold text-blue-600"
        >
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <Link
        href="/editor"
        className="mt-4 inline-block text-sm font-semibold text-blue-600"
      >
        Continue as guest
      </Link>
    </>
  );
}
