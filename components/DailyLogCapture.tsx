"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DailyLogCapture() {
  const [mood, setMood] = useState(7);
  const [energy, setEnergy] = useState("Medium");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/daily-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          moodScore: mood,
          energyLevel: energy,
          notes,
        }),
      });
      if (res.ok) {
        setNotes("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          Mood
          <input type="range" min={1} max={10} value={mood} onChange={(e) => setMood(Number(e.target.value))} />
          <span>{mood}/10</span>
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          Energy
          <select value={energy} onChange={(e) => setEnergy(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-strong)" }}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>
      </div>
      <div className="capture-input" style={{ marginBottom: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
        <input
          type="text"
          placeholder="How did today feel? (fed to the advisor)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary" style={{ alignSelf: "flex-start" }} disabled={saving}>
        {saving ? "Saving…" : "Log today"}
      </button>
    </form>
  );
}
