"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Company, Project } from "@/lib/types";

const STATUSES = ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"];
const PRIORITIES = ["High", "Medium", "Low"];

interface FormState {
  name: string;
  companyId: string;
  status: string;
  description: string;
  deadline: string;
  renderPriority: string;
  estimatedRenderHours: string;
}

function emptyState(p?: Project): FormState {
  return {
    name: p?.name || "",
    companyId: p?.companyId || "",
    status: p?.status || "Idea",
    description: p?.description || "",
    deadline: p?.deadline || "",
    renderPriority: p?.renderPriority || "",
    estimatedRenderHours: p?.estimatedRenderHours !== undefined ? String(p.estimatedRenderHours) : "",
  };
}

function FormBody({ state, setState, companies }: { state: FormState; setState: (s: FormState) => void; companies: Company[] }) {
  return (
    <>
      <div className="form-field">
        <label>Name</label>
        <input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Company</label>
          <select value={state.companyId} onChange={(e) => setState({ ...state, companyId: e.target.value })}>
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={state.status} onChange={(e) => setState({ ...state, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Description</label>
        <textarea value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Deadline</label>
          <input type="date" value={state.deadline} onChange={(e) => setState({ ...state, deadline: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Render Priority</label>
          <select value={state.renderPriority} onChange={(e) => setState({ ...state, renderPriority: e.target.value })}>
            <option value="">—</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Estimated Render Time (hrs)</label>
        <input
          type="number"
          step="0.5"
          value={state.estimatedRenderHours}
          onChange={(e) => setState({ ...state, estimatedRenderHours: e.target.value })}
        />
      </div>
    </>
  );
}

async function save(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Save failed");
}

export function NewProjectButton({
  companies,
  defaultCompanyId,
  defaultStatus,
  label,
  compact,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  defaultStatus?: string;
  label?: string;
  /** Renders as a small round icon-only button (for tight spaces like a Kanban column header) instead of the full pill. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => ({
    ...emptyState(),
    companyId: defaultCompanyId || "",
    status: defaultStatus || "Idea",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await save("/api/projects", "POST", {
        name: state.name.trim(),
        companyId: state.companyId || undefined,
        status: state.status,
        description: state.description,
        deadline: state.deadline || undefined,
        renderPriority: state.renderPriority || undefined,
        estimatedRenderHours: state.estimatedRenderHours ? Number(state.estimatedRenderHours) : undefined,
      });
      setOpen(false);
      setState({ ...emptyState(), companyId: defaultCompanyId || "", status: defaultStatus || "Idea" });
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {compact ? (
        <button
          className="icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => setOpen(true)}
          type="button"
          title={label || "New Project"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 3v18M3 12h18" />
          </svg>
        </button>
      ) : (
        <button className="btn-primary" onClick={() => setOpen(true)} type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M3 12h18" />
          </svg>
          {label || "New Project"}
        </button>
      )}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Project</h2>
            <div className="modal-sub">Writes straight to your Notion Projects database</div>
            <form onSubmit={submit}>
              <FormBody state={state} setState={setState} companies={companies} />
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

export function EditProjectButton({ project, companies }: { project: Project; companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyState(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await save(`/api/projects/${project.id}`, "PATCH", {
        name: state.name.trim(),
        companyId: state.companyId || undefined,
        status: state.status,
        description: state.description,
        deadline: state.deadline || undefined,
        renderPriority: state.renderPriority || undefined,
        estimatedRenderHours: state.estimatedRenderHours ? Number(state.estimatedRenderHours) : undefined,
      });
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
            <h2>Edit {project.name}</h2>
            <div className="modal-sub">Updates the page directly in Notion</div>
            <form onSubmit={submit}>
              <FormBody state={state} setState={setState} companies={companies} />
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
