"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Company } from "@/lib/types";

const TYPES = ["Studio", "SaaS", "Agency", "Other"];

interface FormState {
  name: string;
  type: string;
  startDate: string;
  goals: string;
  description: string;
  monthlyRevenueTarget: string;
  plan: string;
}

function emptyState(c?: Company): FormState {
  return {
    name: c?.name || "",
    type: c?.type || "SaaS",
    startDate: c?.startDate || "",
    goals: c?.goals || "",
    description: c?.description || "",
    monthlyRevenueTarget: c?.monthlyRevenueTarget !== undefined ? String(c.monthlyRevenueTarget) : "",
    plan: c?.plan || "",
  };
}

function FormBody({
  state,
  setState,
}: {
  state: FormState;
  setState: (s: FormState) => void;
}) {
  return (
    <>
      <div className="form-field">
        <label>Name</label>
        <input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Type</label>
          <select value={state.type} onChange={(e) => setState({ ...state, type: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Start Date</label>
          <input type="date" value={state.startDate} onChange={(e) => setState({ ...state, startDate: e.target.value })} />
        </div>
      </div>
      <div className="form-field">
        <label>Description</label>
        <textarea value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} placeholder="What this company does" />
      </div>
      <div className="form-field">
        <label>Goals</label>
        <textarea value={state.goals} onChange={(e) => setState({ ...state, goals: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Monthly Revenue Target ($)</label>
        <input
          type="number"
          value={state.monthlyRevenueTarget}
          onChange={(e) => setState({ ...state, monthlyRevenueTarget: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label>Plan / To-Dos</label>
        <textarea
          value={state.plan}
          onChange={(e) => setState({ ...state, plan: e.target.value })}
          placeholder={"One item per line — this is your running checklist for the company"}
          style={{ minHeight: 90 }}
        />
      </div>
    </>
  );
}

export function NewCompanyButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name.trim(),
          type: state.type,
          startDate: state.startDate || undefined,
          goals: state.goals,
          description: state.description,
          monthlyRevenueTarget: state.monthlyRevenueTarget ? Number(state.monthlyRevenueTarget) : undefined,
          plan: state.plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create company");
      setOpen(false);
      setState(emptyState());
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
        New Company
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Company</h2>
            <div className="modal-sub">Writes straight to your Notion Companies database</div>
            <form onSubmit={submit}>
              <FormBody state={state} setState={setState} />
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

export function EditCompanyButton({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyState(company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name.trim(),
          type: state.type,
          startDate: state.startDate || undefined,
          goals: state.goals,
          description: state.description,
          monthlyRevenueTarget: state.monthlyRevenueTarget ? Number(state.monthlyRevenueTarget) : undefined,
          plan: state.plan,
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
            <h2>Edit {company.name}</h2>
            <div className="modal-sub">Updates the page directly in Notion</div>
            <form onSubmit={submit}>
              <FormBody state={state} setState={setState} />
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
