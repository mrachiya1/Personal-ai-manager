"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SettingField {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea" | "number";
  placeholder?: string;
  help?: string;
}

const COMMON_CHAT_MODELS = [
  "deepseek/deepseek-chat",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct",
];

export function SettingsSection({
  title,
  sub,
  fields,
  values,
  modelPicker,
}: {
  title: string;
  sub: string;
  fields: SettingField[];
  values: Record<string, string | undefined>;
  /** Show a dropdown of common OpenRouter model slugs for this field, plus free-text override. */
  modelPicker?: string;
}) {
  const [state, setState] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card section-card" style={{ marginBottom: 16 }}>
      <h2>{title}</h2>
      <div className="section-sub">{sub}</div>
      <form onSubmit={save}>
        {fields.map((f) => (
          <div className="form-field" key={f.key}>
            <label>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea
                value={state[f.key]}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={4}
                style={{ fontFamily: "monospace", fontSize: 11.5 }}
              />
            ) : f.key === modelPicker ? (
              <>
                <input
                  list={`${f.key}-options`}
                  value={state[f.key]}
                  onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
                <datalist id={`${f.key}-options`}>
                  {COMMON_CHAT_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            ) : (
              <input
                type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                value={state[f.key]}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                step={f.type === "number" ? "any" : undefined}
              />
            )}
            {f.help && <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>{f.help}</div>}
          </div>
        ))}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          {saved && <span style={{ fontSize: 12, color: "var(--good, #0a6b0a)", alignSelf: "center" }}>✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}
