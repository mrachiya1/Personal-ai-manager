"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DbRow {
  key: string;
  label: string;
  id: string;
  overridden: boolean;
}

interface Check {
  key: string;
  ok: boolean;
  title?: string | null;
  reason?: string;
}

function Banner({ kind, children }: { kind: "ok" | "err" | "info"; children: React.ReactNode }) {
  const tone =
    kind === "ok"
      ? { bg: "var(--good-bg)", fg: "var(--good-ink)", br: "rgba(12,163,12,0.25)" }
      : kind === "err"
        ? { bg: "var(--critical-bg)", fg: "var(--critical-ink)", br: "rgba(208,59,59,0.25)" }
        : { bg: "var(--rail)", fg: "var(--ink-secondary)", br: "var(--border)" };
  return (
    <div
      style={{
        fontSize: 12.5, lineHeight: 1.6, borderRadius: 10, padding: "10px 12px", marginBottom: 12,
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.br}`,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function NotionConnectCard({
  connected,
  workspaceName,
  authType,
  connectedAt,
  maskedToken,
  oauthAvailable,
  usingInstallKey,
}: {
  connected: boolean;
  workspaceName?: string | null;
  authType?: string | null;
  connectedAt?: string | null;
  maskedToken?: string;
  oauthAvailable: boolean;
  usingInstallKey: boolean;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function connect() {
    if (!token.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't connect");
      setToken("");
      setMsg({ kind: "ok", text: `Connected to ${data.workspaceName}.` });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/notion/connect", { method: "DELETE" });
      setMsg({ kind: "ok", text: "Disconnected. Your Notion data is untouched." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Notion workspace</span>
        {connected ? <span className="badge paid">Connected</span> : <span className="badge pending">Not connected</span>}
        <div className="spacer" />
        {connected && (
          <button className="filter-btn" type="button" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

        {connected ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
              <Fact label="Workspace" value={workspaceName || "—"} />
              <Fact label="Method" value={authType === "oauth" ? "Notion OAuth" : usingInstallKey ? "Install key (.env)" : "Integration token"} />
              <Fact label="Token" value={maskedToken || (usingInstallKey ? "from NOTION_API_KEY" : "—")} />
              <Fact label="Connected" value={connectedAt ? new Date(connectedAt).toLocaleDateString() : "—"} />
            </div>
            {usingInstallKey && (
              <Banner kind="info">
                You&apos;re currently reading Notion through this install&apos;s shared <code>NOTION_API_KEY</code>. Paste your own
                integration token below to point the app at your own workspace instead.
              </Banner>
            )}
          </>
        ) : (
          <p style={{ margin: "0 0 14px 0", fontSize: 13, lineHeight: 1.65, color: "var(--ink-secondary)" }}>
            Orex OS reads and writes your <strong>own</strong> Notion workspace. Nothing is stored here except the
            connection itself, encrypted at rest.
          </p>
        )}

        {oauthAvailable && !connected && (
          <a className="btn-primary" href="/api/notion/oauth" style={{ display: "inline-flex", marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v16H4z" />
              <path d="M8 8v8l8-8v8" />
            </svg>
            Connect Notion
          </a>
        )}

        <details open={!connected}>
          <summary style={{ fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "var(--ink-secondary)", marginBottom: 10 }}>
            {connected ? "Connect a different workspace" : "Connect with an integration token"}
          </summary>

          <ol style={{ margin: "10px 0 14px 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.75, color: "var(--ink-secondary)" }}>
            <li>
              Open{" "}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "underline" }}>
                notion.so/my-integrations
              </a>{" "}
              → <strong>New integration</strong> → pick your workspace → Submit.
            </li>
            <li>Copy the <strong>Internal Integration Secret</strong> (starts with <code>ntn_</code>).</li>
            <li>
              In Notion, open the page holding your databases → <strong>•••</strong> → <strong>Connections</strong> → add
              that integration. <em>Without this step the token is valid but sees nothing.</em>
            </li>
            <li>Paste the secret below.</li>
          </ol>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ntn_…"
              autoComplete="off"
              style={{
                flex: 1, minWidth: 220, border: "1px solid var(--border)", borderRadius: 9,
                padding: "9px 11px", fontSize: 13, background: "var(--surface-raised)",
                color: "var(--ink)", fontFamily: "inherit",
              }}
            />
            <button className="btn-primary" type="button" onClick={connect} disabled={busy || !token.trim()}>
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="fact-label">{label}</div>
      <div className="fact-value" style={{ fontSize: 12.5, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DatabaseMappingCard({ rows }: { rows: DbRow[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.key, r.id]))
  );
  const [checks, setChecks] = useState<Record<string, Check> | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/notion/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databases: values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMsg({ kind: "ok", text: "Database mapping saved." });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const res = await fetch("/api/notion/databases", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      const map: Record<string, Check> = {};
      for (const c of data.checks || []) map[c.key] = c;
      setChecks(map);
      const bad = (data.checks || []).filter((c: Check) => !c.ok).length;
      setMsg(
        bad === 0
          ? { kind: "ok", text: "All databases reachable." }
          : { kind: "err", text: `${bad} database${bad === 1 ? "" : "s"} unreachable — see the rows below.` }
      );
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Database mapping</span>
        <span className="count-chip">{rows.length}</span>
        <div className="spacer" />
        <button className="filter-btn" type="button" onClick={test} disabled={busy !== null}>
          {busy === "test" ? "Testing…" : "Test connection"}
        </button>
        <button className="btn-primary" type="button" onClick={save} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save mapping"}
        </button>
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <p style={{ margin: "0 0 14px 0", fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-muted)" }}>
          Point each tab at a database in your own workspace. Paste either the database ID or the full Notion URL —
          both work. Leave a row blank to fall back to this install&apos;s default.
        </p>

        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => {
            const check = checks?.[r.key];
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ width: 122, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-secondary)" }}>
                  {r.label}
                </div>
                <input
                  value={values[r.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
                  placeholder="database id or URL"
                  spellCheck={false}
                  style={{
                    flex: 1, minWidth: 200, border: "1px solid var(--border)", borderRadius: 8,
                    padding: "6px 10px", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    background: "var(--surface-raised)", color: "var(--ink)",
                  }}
                />
                <div style={{ width: 190, flexShrink: 0, fontSize: 11 }}>
                  {check ? (
                    check.ok ? (
                      <span style={{ color: "var(--good-ink)", fontWeight: 600 }}>✓ {check.title || "reachable"}</span>
                    ) : (
                      <span style={{ color: "var(--critical-ink)", fontWeight: 600 }}>✕ {check.reason}</span>
                    )
                  ) : (
                    <span className="cell-muted">{r.overridden ? "custom" : "default"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AccountDataCard({ authEnabled }: { authEnabled: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function wipe() {
    if (confirm !== "DELETE" || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/data", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setConfirm("");
      setMsg({ kind: "ok", text: data.message });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Your data</span>
        <div className="spacer" />
        <a className="filter-btn" href="/api/account/data" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v12M7 11l5 5 5-5" />
            <path d="M4 20h16" />
          </svg>
          Export
        </a>
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

        <p style={{ margin: "0 0 14px 0", fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-secondary)" }}>
          Orex OS stores only your connection settings — the Notion token (encrypted), your database mapping, your API
          keys and a few preferences. Your actual projects, clients and finances live in your own Notion workspace and
          are never copied here. <strong>Export</strong> gives you the settings file, with secrets masked.
        </p>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Delete stored settings</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", lineHeight: 1.6, marginBottom: 10 }}>
            Removes your Notion connection, database mapping and keys from this app. Your Notion workspace is not
            touched — nothing in it is deleted.
            {authEnabled && " You'll stay signed in and can reconnect at any time."}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5,
                background: "var(--surface-raised)", color: "var(--ink)", fontFamily: "inherit", width: 200,
              }}
            />
            <button
              type="button"
              onClick={wipe}
              disabled={confirm !== "DELETE" || busy}
              className="btn-ghost"
              style={{
                borderColor: confirm === "DELETE" ? "rgba(208,59,59,0.4)" : "var(--border)",
                color: confirm === "DELETE" ? "var(--critical-ink)" : "var(--ink-muted)",
              }}
            >
              {busy ? "Deleting…" : "Delete my settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface SchemaCheckRow {
  name: string;
  present: boolean;
  kind: string;
  purpose: string;
  typeMismatch?: string;
}

/**
 * Adds the Projects-database properties the projects workspace needs.
 *
 * Strictly additive — it never renames, retypes or removes anything, so
 * pressing it on a database that already has some of these is safe.
 */
export function ProjectFieldsCard() {
  const [checks, setChecks] = useState<SchemaCheckRow[] | null>(null);
  const [busy, setBusy] = useState<"check" | "add" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const router = useRouter();

  async function check() {
    setBusy("check");
    setMsg(null);
    try {
      const res = await fetch("/api/notion/schema");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read the database");
      setChecks(data.checks);
      const missing = data.checks.filter((c: SchemaCheckRow) => !c.present).length;
      setMsg(
        missing === 0
          ? { kind: "ok", text: "Every field is already there." }
          : { kind: "info", text: `${missing} field${missing === 1 ? "" : "s"} missing.` }
      );
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Check failed" });
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy("add");
    setMsg(null);
    try {
      const res = await fetch("/api/notion/schema", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add the fields");
      setMsg({ kind: "ok", text: data.message });
      await check();
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed" });
      setBusy(null);
    }
  }

  const missing = checks?.filter((c) => !c.present) ?? [];
  const mismatched = checks?.filter((c) => c.typeMismatch) ?? [];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Project fields</span>
        {checks && (
          <span className="count-chip">
            {checks.length - missing.length}/{checks.length}
          </span>
        )}
        <div className="spacer" />
        <button className="filter-btn" type="button" onClick={check} disabled={busy !== null}>
          {busy === "check" ? "Checking…" : "Check"}
        </button>
        {missing.length > 0 && (
          <button className="btn-primary" type="button" onClick={add} disabled={busy !== null}>
            {busy === "add" ? "Adding…" : `Add ${missing.length} missing`}
          </button>
        )}
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

        <p style={{ margin: "0 0 14px 0", fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-muted)" }}>
          The Projects screen tracks assignee, start date, value, headline, client requests and review history. Those
          are Notion properties your Projects database may not have yet. This adds the missing ones for you —{" "}
          <strong style={{ color: "var(--ink-secondary)" }}>it only ever adds</strong>, never renames, retypes or
          deletes an existing property, so nothing you already have can be lost.
        </p>

        {!checks && (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            Press <strong>Check</strong> to see which fields exist.
          </div>
        )}

        {checks && (
          <div style={{ display: "grid", gap: 7 }}>
            {checks.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0, minWidth: 62,
                    textAlign: "center",
                    background: c.present ? "var(--good-bg)" : "var(--warning-bg)",
                    color: c.present ? "var(--good-ink)" : "var(--warning-ink)",
                  }}
                >
                  {c.present ? "present" : "missing"}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {c.name} <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>· {c.kind}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>{c.purpose}</div>
                  {c.typeMismatch && (
                    <div style={{ fontSize: 11.5, color: "var(--critical-ink)", marginTop: 2 }}>
                      {c.typeMismatch} — left alone on purpose. Rename or fix it in Notion; changing its type here
                      would destroy whatever is already in that column.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {mismatched.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Banner kind="err">
              {mismatched.length} field{mismatched.length === 1 ? " exists" : "s exist"} with the wrong type. Those are
              never auto-corrected — resolve them in Notion.
            </Banner>
          </div>
        )}
      </div>
    </div>
  );
}
