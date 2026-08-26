"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRecord, Project, Payment, Company } from "@/lib/types";

const STATUSES = ["Pending", "Partially Paid", "Paid", "Overdue"];

function clientLabel(c: ClientRecord, companies: Company[]): string {
  const company = companies.find((co) => co.id === c.companyId);
  return `${c.name}${company ? ` — ${company.name}` : ""} (${c.relationship})`;
}

function Fields({
  clients, companies, projects, label, setLabel, clientId, setClientId, projectId, setProjectId,
  amount, setAmount, dueDate, setDueDate, status, setStatus,
}: any) {
  return (
    <>
      <div className="form-field">
        <label>Label</label>
        <input value={label} onChange={(e: any) => setLabel(e.target.value)} placeholder="e.g. Website — milestone 2" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Client</label>
          <select value={clientId} onChange={(e: any) => setClientId(e.target.value)}>
            <option value="">— None —</option>
            {clients.map((c: ClientRecord) => (
              <option key={c.id} value={c.id}>{clientLabel(c, companies)}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
            Pulled straight from your Clients list — company &amp; relationship shown alongside each name.
          </div>
        </div>
        <div className="form-field">
          <label>Project</label>
          <select value={projectId} onChange={(e: any) => setProjectId(e.target.value)}>
            <option value="">— None —</option>
            {projects.map((p: Project) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e: any) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="form-field">
          <label>Due Date</label>
          <input type="date" value={dueDate} onChange={(e: any) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="form-field">
        <label>Status</label>
        <select value={status} onChange={(e: any) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </>
  );
}

export function NewPaymentButton({ clients, companies, projects }: { clients: ClientRecord[]; companies: Company[]; projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !amount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          clientId: clientId || undefined,
          projectId: projectId || undefined,
          amount: Number(amount),
          dueDate,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add payment");
      setOpen(false);
      setLabel(""); setClientId(""); setProjectId(""); setAmount(""); setStatus("Pending");
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
        Add Payment
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Payment</h2>
            <div className="modal-sub">Tracks what a client owes — mark it Paid later to auto-log it as income too</div>
            <form onSubmit={submit}>
              <Fields
                clients={clients} companies={companies} projects={projects} label={label} setLabel={setLabel}
                clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId}
                amount={amount} setAmount={setAmount} dueDate={dueDate} setDueDate={setDueDate}
                status={status} setStatus={setStatus}
              />
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

export function EditPaymentButton({ payment, clients, companies, projects }: { payment: Payment; clients: ClientRecord[]; companies: Company[]; projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(payment.label);
  const [clientId, setClientId] = useState(payment.clientId || "");
  const [projectId, setProjectId] = useState(payment.projectId || "");
  const [amount, setAmount] = useState(String(payment.amount));
  const [dueDate, setDueDate] = useState(payment.dueDate || new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(payment.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !amount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          clientId: clientId || undefined,
          projectId: projectId || undefined,
          amount: Number(amount),
          dueDate,
          status,
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
            <h2>Edit {payment.label}</h2>
            <div className="modal-sub">
              Updates the Notion page directly. To mark it Paid and auto-log the matching income entry, use the
              &ldquo;Mark Paid&rdquo; button on the Payments list instead of setting Status here.
            </div>
            <form onSubmit={submit}>
              <Fields
                clients={clients} companies={companies} projects={projects} label={label} setLabel={setLabel}
                clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId}
                amount={amount} setAmount={setAmount} dueDate={dueDate} setDueDate={setDueDate}
                status={status} setStatus={setStatus}
              />
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

export function MarkPaidButton({ payment }: { payment: Payment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function markPaid() {
    if (!confirm(`Mark "${payment.label}" as paid? This also logs a matching Income entry.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${payment.id}/mark-paid`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark paid");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (payment.status === "Paid") return <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>✓ Paid</span>;
  return (
    <span>
      <button className="link-btn" onClick={markPaid} disabled={busy} type="button">
        {busy ? "…" : "Mark Paid"}
      </button>
      {error && <div style={{ fontSize: 10.5, color: "var(--critical, #a12424)", maxWidth: 160 }}>{error}</div>}
    </span>
  );
}
