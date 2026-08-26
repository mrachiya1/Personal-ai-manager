"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Company, Account, Project } from "@/lib/types";

export function NewGoalButton({
  companies,
  accounts,
  projects,
}: {
  companies: Company[];
  accounts: Account[];
  projects: Project[];
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [type, setType] = useState("Personal");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim() || !targetAmount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          type,
          targetAmount: Number(targetAmount),
          currentAmount: currentAmount ? Number(currentAmount) : 0,
          deadline: deadline || undefined,
          linkedCompanyId: companyId || undefined,
          linkedAccountId: accountId || undefined,
          linkedProjectId: projectId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add goal");
      setOpen(false);
      setGoal(""); setTargetAmount(""); setCurrentAmount(""); setDeadline(""); setCompanyId(""); setAccountId(""); setProjectId("");
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
        Add Goal
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Finance Goal</h2>
            <div className="modal-sub">Writes straight to your Notion Finance Goals database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Goal</label>
                <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Emergency fund" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="Personal">Personal</option>
                    <option value="Company">Company</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Deadline</label>
                  <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Target Amount</label>
                  <input type="number" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Current Amount</label>
                  <input type="number" step="0.01" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="form-field">
                <label>Linked Company</label>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Linked Bank Account</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Linked Project</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">—</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
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
