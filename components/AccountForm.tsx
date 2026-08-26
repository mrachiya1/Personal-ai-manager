"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account } from "@/lib/types";

const TYPES = ["Bank", "Investment", "Cash", "Credit Card", "Other"];

export function NewAccountButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Bank");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [institution, setInstitution] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !balance || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          balance: Number(balance),
          currency,
          institution,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add account");
      setOpen(false);
      setName(""); setBalance(""); setInstitution(""); setNotes("");
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
        Add Account
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Account</h2>
            <div className="modal-sub">Bank, investment, cash, or credit — writes straight to your Notion Accounts database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Commercial Bank Savings" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Balance</label>
                  <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Currency</label>
                  <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD, LKR…" />
                </div>
                <div className="form-field">
                  <label>Institution</label>
                  <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Commercial Bank" />
                </div>
              </div>
              <div className="form-field">
                <label>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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

export function EditAccountButton({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(String(account.balance));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!balance || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: Number(balance), lastUpdated: new Date().toISOString().slice(0, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update balance");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn-discard" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setOpen(true)} type="button">
        Update
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Update Balance — {account.name}</h2>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>New Balance</label>
                <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} autoFocus />
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
