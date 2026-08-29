"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * Email + password sign-in and sign-up.
 *
 * Sign-up creates the account through /api/account/register and then hands
 * straight over to next-auth's own `signIn`, so there is exactly one code
 * path that ever issues a session.
 */
export default function LoginForm({
  callbackUrl,
  signupEnabled,
  minPasswordLength,
}: {
  callbackUrl: string;
  signupEnabled: boolean;
  minPasswordLength: number;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      if (mode === "signup") {
        const res = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't create that account");
      }

      const result = await signIn("credentials", { email, password, redirect: false });

      if (result?.error) {
        // next-auth reports every credential failure identically on purpose —
        // wrong password, unknown address and rate-limited are the same
        // response, so this message can't be used to enumerate accounts.
        throw new Error(
          mode === "signup"
            ? "Account created, but signing in failed. Try signing in below."
            : "That email and password don't match. If you've tried several times, wait a few minutes."
        );
      }

      window.location.href = callbackUrl || "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <>
      {/* Tabs rather than a link that swaps the whole card: both routes are
          equally likely on a tool people are still being invited to, and a
          tab strip says so without anyone having to read a sentence. */}
      <div className="auth-tabs" role="tablist" aria-label="Sign in or sign up">
        <button
          role="tab"
          aria-selected={mode === "signin"}
          className={`auth-tab${mode === "signin" ? " on" : ""}`}
          onClick={() => { setMode("signin"); setError(null); }}
        >
          Login
        </button>
        {signupEnabled && (
          <button
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-tab${mode === "signup" ? " on" : ""}`}
            onClick={() => { setMode("signup"); setError(null); }}
          >
            Sign Up
          </button>
        )}
      </div>

      <h1 className="auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="auth-sub">
        {mode === "signup"
          ? "Free to create. You connect your own Notion workspace afterwards — your projects, finances and notes stay in your Notion, never in a shared database here."
          : "Every account reads its own Notion workspace. Nothing is shared between accounts."}
      </p>

      <form onSubmit={submit} className="auth-form">
      {error && (
        <div className="auth-error">
          {error}
        </div>
      )}

      {mode === "signup" && (
        <div>
          <label className="auth-label">
            Name <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>(optional)</span>
          </label>
          <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
      )}

      <div>
        <label className="auth-label">
          Email
        </label>
        <input
          className="auth-input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="auth-label">
          Password
        </label>
        <input
          className="auth-input"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? `at least ${minPasswordLength} characters` : ""}
        />
        {mode === "signup" && (
          <div className="auth-hint">
            At least {minPasswordLength} characters. Use something you don&apos;t use anywhere else.
          </div>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary auth-submit"
        disabled={busy}
      >
        {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      </form>
    </>
  );
}
