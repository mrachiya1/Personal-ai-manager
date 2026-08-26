"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function IdeaCapture() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: value.trim(), priority: "Later" }),
      });
      if (res.ok) {
        setValue("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="capture-input">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M3 12h18" />
      </svg>
      <input
        type="text"
        placeholder="Capture a new idea…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
      />
    </form>
  );
}
