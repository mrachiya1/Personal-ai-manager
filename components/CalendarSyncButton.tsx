"use client";

import { useState } from "react";

export function CalendarSyncButton({ summary, date, description }: { summary: string; date: string; description?: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setState("saving");
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, date, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setState("done");
    } catch (err: any) {
      setState("error");
      setMsg(err.message);
    }
  }

  if (state === "done") return <span style={{ fontSize: 11.5, color: "var(--good)" }}>✓ On calendar</span>;

  return (
    <span>
      <button className="link-btn" onClick={sync} type="button" disabled={state === "saving"}>
        {state === "saving" ? "Syncing…" : "📅 Add to Calendar"}
      </button>
      {state === "error" && <div style={{ fontSize: 11, color: "var(--critical)", maxWidth: 220 }}>{msg}</div>}
    </span>
  );
}
