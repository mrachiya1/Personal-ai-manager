"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Company, Account, Payment } from "@/lib/types";
import { CurrencyAmountField } from "@/components/CurrencyAmountField";

const SOURCES = ["Client Payment", "Salary", "Freelance", "Investment", "Gift", "Donation Received", "Other"];

export function NewIncomeButton({
  companies,
  accounts = [],
  payments = [],
  defaultCompanyId,
  defaultAccountId,
}: {
  companies: Company[];
  accounts?: Account[];
  /** Unsettled payments (no Linked Income yet) — lets a "Client Payment" income row settle one directly. */
  payments?: Payment[];
  defaultCompanyId?: string;
  defaultAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState("Client Payment");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId || "");
  const [accountId, setAccountId] = useState(defaultAccountId || "");
  const [linkedPaymentId, setLinkedPaymentId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const settleable = payments.filter((p) => !p.linkedIncomeId && p.status !== "Paid");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          source,
          amount: Number(amount),
          currency,
          date,
          recurring,
          companyId: companyId || undefined,
          accountId: accountId || undefined,
          notes,
          linkedPaymentId: source === "Client Payment" ? linkedPaymentId || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log income");
      setOpen(false);
      setName(""); setAmount(""); setNotes(""); setRecurring(false); setCompanyId(""); setAccountId(defaultAccountId || "");
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
        Log Income
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Log Income</h2>
            <div className="modal-sub">Writes straight to your Notion Income database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. August retainer" autoFocus />
              </div>
              <div className="form-field">
                <label>Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
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
              {source === "Client Payment" && settleable.length > 0 && (
                <div className="form-field">
                  <label>Settles Payment (optional)</label>
                  <select value={linkedPaymentId} onChange={(e) => setLinkedPaymentId(e.target.value)}>
                    <option value="">— Not linked to a Payments record —</option>
                    {settleable.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.amount.toLocaleString()})</option>
                    ))}
                  </select>
                  {linkedPaymentId && (
                    <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
                      That Payment will be marked Paid and linked to this income entry.
                    </div>
                  )}
                </div>
              )}
              <div className="form-field">
                <label>Deposit To Account</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">— Not tracked against an account —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency || "LKR"} {a.balance.toLocaleString()})</option>
                  ))}
                </select>
                {accountId && (
                  <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
                    This account&rsquo;s balance will be increased by the amount above when you save.
                  </div>
                )}
              </div>
              <label className="form-check" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Recurring monthly (salary, retainer…)
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
