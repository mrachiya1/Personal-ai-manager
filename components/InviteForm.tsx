"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function InviteForm({ token, email }: { token: string; email: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      // 1. Redeem invite and create account.
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create account");

      // 2. Sign in automatically.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        throw new Error("Account created but sign-in failed — try signing in at /login");
      }

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      {error && <div className="auth-error">{error}</div>}

      <div>
        <label className="auth-label">
          Name <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>(optional)</span>
        </label>
        <input
          className="auth-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="How should we address you?"
        />
      </div>

      <div>
        <label className="auth-label">Email</label>
        <input
          className="auth-input"
          type="email"
          value={email}
          readOnly
          style={{ opacity: 0.65, cursor: "default" }}
        />
      </div>

      <div>
        <label className="auth-label">Password</label>
        <input
          className="auth-input"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Choose a strong password"
        />
        <div className="auth-hint">At least 8 characters. Use something unique to this account.</div>
      </div>

      <button type="submit" className="btn-primary auth-submit" disabled={busy}>
        {busy ? "Creating account…" : "Activate account"}
      </button>
    </form>
  );
}
