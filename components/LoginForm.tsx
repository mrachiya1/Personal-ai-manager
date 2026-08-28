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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 13.5,
    background: "var(--surface-raised)",
    color: "var(--ink)",
    fontFamily: "inherit",
  };

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
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em" }}>
        {mode === "signup" ? "Create your account" : "Sign in to Orex OS"}
      </h1>
      <p style={{ margin: "8px 0 20px 0", fontSize: 13, lineHeight: 1.6, color: "var(--ink-muted)" }}>
        {mode === "signup"
          ? "Free to create. You'll connect your own Notion workspace afterwards — your data stays in your Notion, not here."
          : "Projects, finances and AI slip scanning, reading your own Notion workspace."}
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && (
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--critical-ink)",
            background: "var(--critical-bg)",
            border: "1px solid rgba(208,59,59,0.25)",
            borderRadius: 9,
            padding: "9px 11px",
          }}
        >
          {error}
        </div>
      )}

      {mode === "signup" && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-secondary)", display: "block", marginBottom: 4 }}>
            Name <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>(optional)</span>
          </label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
      )}

      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-secondary)", display: "block", marginBottom: 4 }}>
          Email
        </label>
        <input
          style={inputStyle}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-secondary)", display: "block", marginBottom: 4 }}>
          Password
        </label>
        <input
          style={inputStyle}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? `at least ${minPasswordLength} characters` : ""}
        />
        {mode === "signup" && (
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 5, lineHeight: 1.5 }}>
            At least {minPasswordLength} characters. Use something you don&apos;t use anywhere else.
          </div>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={busy}
        style={{ width: "100%", justifyContent: "center", padding: "11px 14px", fontSize: 13.5, borderRadius: 10, marginTop: 2 }}
      >
        {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      {signupEnabled && (
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-muted)",
            fontSize: 12.5,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: "4px 0 0 0",
          }}
        >
          {mode === "signin" ? (
            <>
              No account yet? <strong style={{ color: "var(--ink-secondary)" }}>Create one</strong>
            </>
          ) : (
            <>
              Already have an account? <strong style={{ color: "var(--ink-secondary)" }}>Sign in</strong>
            </>
          )}
        </button>
      )}
      </form>
    </>
  );
}
