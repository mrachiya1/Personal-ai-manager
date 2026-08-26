"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Field {
  key: string;
  label: string;
  hint?: string;
  type?: "text" | "password" | "date";
  placeholder?: string;
}

/**
 * A save-on-demand settings block backed by /api/account/preferences.
 *
 * Every field is optional and every one falls back to this install's env var
 * when left blank, so a user who never opens this page still gets a working
 * app — and one who fills it in is spending their own API credits, not the
 * install owner's.
 */
export function PreferencesCard({
  title,
  sub,
  fields,
  values,
  fallbackNote,
}: {
  title: string;
  sub: string;
  fields: Field[];
  values: Record<string, string>;
  fallbackNote?: string;
}) {
  const [state, setState] = useState<Record<string, string>>(values);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, string> = {};
      for (const f of fields) payload[f.key] = state[f.key] ?? "";
      const res = await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMsg({ kind: "ok", text: "Saved." });
      setDirty(false);
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <div className="spacer" />
        <button className="btn-primary" type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {msg && (
          <div
            style={{
              fontSize: 12.5, borderRadius: 9, padding: "9px 11px", marginBottom: 12,
              background: msg.kind === "ok" ? "var(--good-bg)" : "var(--critical-bg)",
              color: msg.kind === "ok" ? "#0a6b0a" : "#a12424",
            }}
          >
            {msg.text}
          </div>
        )}

        <p style={{ margin: "0 0 14px 0", fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-muted)" }}>{sub}</p>

        <div style={{ display: "grid", gap: 11 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-secondary)", display: "block", marginBottom: 4 }}>
                {f.label}
              </label>
              <input
                type={f.type || "text"}
                value={state[f.key] ?? ""}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setState((s) => ({ ...s, [f.key]: e.target.value }));
                  setDirty(true);
                }}
                style={{
                  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "8px 11px", fontSize: 12.5, background: "var(--surface-raised)",
                  color: "var(--ink)", fontFamily: "inherit",
                }}
              />
              {f.hint && (
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4, lineHeight: 1.5 }}>{f.hint}</div>
              )}
            </div>
          ))}
        </div>

        {fallbackNote && (
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 14, lineHeight: 1.6, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {fallbackNote}
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple client-side tab strip for the Settings page. */
export function SettingsTabs({ tabs }: { tabs: { id: string; label: string; icon?: React.ReactNode; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) || tabs[0];
  return (
    <>
      <div className="page-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`page-tab${t.id === active ? " active" : ""}`} onClick={() => setActive(t.id)} type="button">
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {current?.content}
    </>
  );
}
