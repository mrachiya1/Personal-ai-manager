"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SleepButtons({ hasOpenLog }: { hasOpenLog: boolean }) {
  const [loading, setLoading] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function tap(action: "start" | "end") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn-primary"
          style={{ background: "var(--violet)", flex: 1, justifyContent: "center", padding: "16px 0", fontSize: 14 }}
          onClick={() => tap("start")}
          disabled={loading !== null || hasOpenLog}
        >
          😴 {loading === "start" ? "Logging…" : "Went to Sleep"}
        </button>
        <button
          className="btn-primary"
          style={{ background: "var(--yellow)", flex: 1, justifyContent: "center", padding: "16px 0", fontSize: 14, color: "#241a00" }}
          onClick={() => tap("end")}
          disabled={loading !== null || !hasOpenLog}
        >
          ☀️ {loading === "end" ? "Logging…" : "Woke Up"}
        </button>
      </div>
      {error && <div style={{ color: "#a12424", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      {hasOpenLog && (
        <div style={{ color: "var(--ink-muted)", fontSize: 12.5, marginTop: 10 }}>
          You're currently logged as asleep — tap "Woke Up" when you get up.
        </div>
      )}
    </div>
  );
}
