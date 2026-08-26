"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteSleepLogButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!confirm("Delete this sleep log entry? This can't be undone from the app.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sleep/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      router.refresh();
    } catch (e: any) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <button className="link-btn" onClick={remove} disabled={busy} type="button" style={{ color: "var(--critical, #a12424)" }}>
      {busy ? "…" : "Delete"}
    </button>
  );
}
