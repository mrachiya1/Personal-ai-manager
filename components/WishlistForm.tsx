"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewWishlistButton() {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [category, setCategory] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: item.trim(),
          category,
          estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
          priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add item");
      setOpen(false);
      setItem(""); setCategory(""); setEstimatedCost(""); setPriority("Medium");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18M3 12h18" />
        </svg>
        Add to Wishlist
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Wishlist</h2>
            <div className="modal-sub">Writes straight to your Notion Wishlist Items database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Item</label>
                <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. New GPU" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Category</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Hardware, travel…" />
                </div>
                <div className="form-field">
                  <label>Estimated Cost</label>
                  <input type="number" step="0.01" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
                </div>
              </div>
              <div className="form-field">
                <label>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="form-actions">
                <button type="button" className="btn-discard" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
