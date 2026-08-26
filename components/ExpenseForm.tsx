"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Company, Account, Expense } from "@/lib/types";
import { CurrencyAmountField } from "@/components/CurrencyAmountField";

const CATEGORIES = ["Subscription", "Software", "Fuel", "Salary", "Rent", "Donation", "Other"];

export function NewExpenseButton({
  companies,
  accounts = [],
  defaultCompanyId,
  defaultAccountId,
}: {
  companies: Company[];
  accounts?: Account[];
  defaultCompanyId?: string;
  defaultAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Subscription");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId || "");
  const [accountId, setAccountId] = useState(defaultAccountId || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function scanReceipt(file: File) {
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/expenses/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that receipt");
      const ex = data.extracted || {};
      if (ex.vendor) { setVendor(ex.vendor); if (!name) setName(ex.vendor); }
      if (ex.amount !== undefined) setAmount(String(ex.amount));
      if (ex.date) setDate(ex.date);
      if (ex.category && CATEGORIES.includes(ex.category)) setCategory(ex.category);
    } catch (err: any) {
      setError(`Scan failed: ${err.message} — fill the form in manually below.`);
    } finally {
      setScanning(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          amount: Number(amount),
          currency,
          vendor,
          date,
          recurring,
          companyId: companyId || undefined,
          accountId: accountId || undefined,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log expense");
      setOpen(false);
      setName(""); setAmount(""); setVendor(""); setNotes(""); setRecurring(false); setCompanyId(""); setAccountId(defaultAccountId || "");
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
        Log Expense
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Log Expense</h2>
            <div className="modal-sub">Snap a receipt to auto-fill, or type it in — either way you confirm before saving</div>

            <div
              style={{
                border: "1px dashed var(--border-strong)", borderRadius: 12, padding: "14px 16px",
                marginBottom: 16, display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                background: "var(--surface)",
              }}
              onClick={() => fileRef.current?.click()}
            >
              <span style={{ fontSize: 20 }}>📷</span>
              <div style={{ fontSize: 12.5, color: "var(--ink-secondary)" }}>
                {scanning ? "Reading receipt…" : "Tap to photograph or upload a bill — AI fills in the fields below"}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) scanReceipt(f);
                }}
              />
            </div>

            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adobe Creative Cloud" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Vendor</label>
                  <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
              </div>
              <CurrencyAmountField amount={amount} currency={currency} onAmountChange={setAmount} onCurrencyChange={setCurrency} />
              <div className="form-row">
                <div className="form-field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Company</label>
                  <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    <option value="">Personal</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label>Pay From Account</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">— Not tracked against an account —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency || "LKR"} {a.balance.toLocaleString()})</option>
                  ))}
                </select>
                {accountId && (
                  <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
                    This account&rsquo;s balance will be reduced by the amount above when you save.
                  </div>
                )}
              </div>
              <label className="form-check" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Recurring monthly (subscription, rent, salary…)
              </label>
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

export function EditExpenseButton({ expense, companies }: { expense: Expense; companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(expense.name);
  const [category, setCategory] = useState<string>(expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [currency, setCurrency] = useState<string>(expense.currency || "LKR");
  const [vendor, setVendor] = useState(expense.vendor || "");
  const [date, setDate] = useState(expense.date || new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(expense.recurring);
  const [companyId, setCompanyId] = useState(expense.companyId || "");
  const [notes, setNotes] = useState(expense.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          amount: Number(amount),
          currency,
          vendor,
          date,
          recurring,
          companyId: companyId || undefined,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
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
      <button className="link-btn" onClick={() => setOpen(true)} type="button">Edit</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit {expense.name}</h2>
            <div className="modal-sub">
              Updates the page directly in Notion. Account balance isn&rsquo;t re-adjusted automatically on edit —
              use the account&rsquo;s &ldquo;Update&rdquo; button on the Finance page if the amount changed materially.
            </div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Vendor</label>
                  <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
              </div>
              <CurrencyAmountField amount={amount} currency={currency} onAmountChange={setAmount} onCurrencyChange={setCurrency} />
              <div className="form-row">
                <div className="form-field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Company</label>
                  <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    <option value="">Personal</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="form-check" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Recurring monthly
              </label>
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
