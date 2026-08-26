"use client";

import { useState } from "react";

interface Insight {
  headline: string;
  detail: string;
  severity?: "info" | "watch" | "urgent";
  evidence?: string;
}

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  urgent: { bg: "var(--critical-bg)", fg: "#a12424", label: "Act now" },
  watch: { bg: "var(--warning-bg)", fg: "#93630f", label: "Watch" },
  info: { bg: "var(--good-bg)", fg: "#0a6b0a", label: "FYI" },
};

/**
 * On-demand AI read of the current page's data.
 *
 * Deliberately NOT automatic: it costs a model call, and an insight panel that
 * regenerates on every page load trains you to ignore it. You ask, it answers,
 * and it always shows which numbers it looked at so the claim is checkable.
 */
export default function AiInsights({
  scope,
  title,
  sub,
}: {
  scope: "projects" | "finance";
  title: string;
  sub: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState("");

  async function run() {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate insights");
      setInsights(Array.isArray(data.insights) ? data.insights : []);
      setSummary(data.summary || "");
      setModel(data.model || "");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <span className="count-chip">AI</span>
        <div className="spacer" />
        <button className="filter-btn" onClick={run} disabled={state === "loading"} type="button">
          {state === "loading" ? (
            "Thinking…"
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
              {state === "done" ? "Regenerate" : "Analyse"}
            </>
          )}
        </button>
      </div>

      <div style={{ padding: "14px 16px 16px 16px" }}>
        {state === "idle" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.6 }}>{sub}</div>
        )}

        {state === "error" && (
          <div style={{ fontSize: 12.5, color: "#a12424", lineHeight: 1.6 }}>
            {error}
            <div style={{ color: "var(--ink-muted)", marginTop: 6 }}>
              An OpenRouter key is needed for this — add one under Settings.
            </div>
          </div>
        )}

        {state === "loading" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Reading your data…</div>
        )}

        {state === "done" && (
          <>
            {summary && (
              <p style={{ margin: "0 0 14px 0", fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-secondary)" }}>
                {summary}
              </p>
            )}
            {insights.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nothing stood out.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((ins, i) => {
                  const tone = TONE[ins.severity || "info"] || TONE.info;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 11,
                        padding: "11px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "var(--rail)",
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0, alignSelf: "flex-start", fontSize: 10, fontWeight: 700,
                          padding: "3px 7px", borderRadius: 6, background: tone.bg, color: tone.fg,
                        }}
                      >
                        {tone.label}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{ins.headline}</div>
                        <div style={{ fontSize: 12.5, color: "var(--ink-secondary)", lineHeight: 1.6, marginTop: 3 }}>
                          {ins.detail}
                        </div>
                        {ins.evidence && (
                          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 5 }}>
                            Based on: {ins.evidence}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {model && (
              <div style={{ fontSize: 10.5, color: "var(--ink-muted)", marginTop: 12 }}>
                Generated by {model} from your live Notion data. Treat it as a prompt to look, not a verdict.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
