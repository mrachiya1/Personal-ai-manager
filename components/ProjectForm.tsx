"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRecord, Company, Project, TeamMember } from "@/lib/types";

const STATUSES = ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"];
const PRIORITIES = ["High", "Medium", "Low"];

interface FormState {
  name: string;
  companyId: string;
  clientId: string;
  status: string;
  headline: string;
  description: string;
  startDate: string;
  deadline: string;
  renderPriority: string;
  estimatedRenderHours: string;
  value: string;
  assignedTo: string[];
}

function emptyState(p?: Project): FormState {
  return {
    name: p?.name || "",
    companyId: p?.companyId || "",
    clientId: p?.clientId || "",
    status: p?.status || "Idea",
    headline: p?.headline || "",
    description: p?.description || "",
    startDate: p?.startDate || "",
    deadline: p?.deadline || "",
    renderPriority: p?.renderPriority || "",
    estimatedRenderHours: p?.estimatedRenderHours !== undefined ? String(p.estimatedRenderHours) : "",
    value: p?.value !== undefined ? String(p.value) : "",
    assignedTo: p?.assignedTo || [],
  };
}

/** The shape both buttons send to the API — kept in one place so create and
 *  edit can never drift apart on which fields they save. */
function payload(state: FormState) {
  return {
    name: state.name.trim(),
    companyId: state.companyId,
    clientId: state.clientId,
    status: state.status,
    headline: state.headline,
    description: state.description,
    startDate: state.startDate,
    deadline: state.deadline,
    renderPriority: state.renderPriority,
    estimatedRenderHours: state.estimatedRenderHours ? Number(state.estimatedRenderHours) : undefined,
    value: state.value ? Number(state.value) : undefined,
    assignedTo: state.assignedTo,
  };
}

function FormBody({
  state,
  setState,
  companies,
  clients = [],
  team = [],
}: {
  state: FormState;
  setState: (s: FormState) => void;
  companies: Company[];
  clients?: ClientRecord[];
  team?: TeamMember[];
}) {
  // Picking a company narrows the client list to that company's clients, which
  // is what makes the folder tree (Company → Client → Project) line up.
  const clientChoices = state.companyId ? clients.filter((c) => c.companyId === state.companyId) : clients;
  // A client already set on another company must stay visible, or editing an
  // unrelated field would silently unset it.
  const currentClient = clients.find((c) => c.id === state.clientId);
  const clientList =
    currentClient && !clientChoices.some((c) => c.id === currentClient.id)
      ? [currentClient, ...clientChoices]
      : clientChoices;

  function toggleAssignee(id: string) {
    setState({
      ...state,
      assignedTo: state.assignedTo.includes(id)
        ? state.assignedTo.filter((x) => x !== id)
        : [...state.assignedTo, id],
    });
  }

  return (
    <>
      <div className="form-field">
        <label>Name</label>
        <input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} autoFocus />
      </div>
      <div className="form-field">
        <label>Headline</label>
        <input
          value={state.headline}
          placeholder="One line the team sees at a glance"
          onChange={(e) => setState({ ...state, headline: e.target.value })}
        />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Company</label>
          <select
            value={state.companyId}
            onChange={(e) => {
              const companyId = e.target.value;
              // Drop a client that doesn't belong to the newly chosen company,
              // rather than filing the project under a mismatched folder.
              const keep = clients.find((c) => c.id === state.clientId);
              const clientId = !companyId || !keep || keep.companyId === companyId ? state.clientId : "";
              setState({ ...state, companyId, clientId });
            }}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Client folder</label>
          <select
            value={state.clientId}
            onChange={(e) => setState({ ...state, clientId: e.target.value })}
            disabled={!clients.length}
          >
            <option value="">{clients.length ? "No client" : "No clients yet"}</option>
            {clientList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Status</label>
          <select value={state.status} onChange={(e) => setState({ ...state, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Project value</label>
          <input
            type="number"
            step="1"
            min="0"
            placeholder="0"
            value={state.value}
            onChange={(e) => setState({ ...state, value: e.target.value })}
          />
        </div>
      </div>
      {team.length > 0 && (
        <div className="form-field">
          <label>Assign to</label>
          <div className="form-chips">
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`form-chip${state.assignedTo.includes(m.id) ? " on" : ""}`}
                onClick={() => toggleAssignee(m.id)}
                aria-pressed={state.assignedTo.includes(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="form-field">
        <label>Description</label>
        <textarea value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Start date</label>
          <input type="date" value={state.startDate} onChange={(e) => setState({ ...state, startDate: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Deadline</label>
          <input type="date" value={state.deadline} onChange={(e) => setState({ ...state, deadline: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
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
  clients = [],
  team = [],
  defaultCompanyId,
  defaultClientId,
  defaultStatus,
  label,
  compact,
}: {
  companies: Company[];
  clients?: ClientRecord[];
  team?: TeamMember[];
  defaultCompanyId?: string;
  defaultClientId?: string;
  defaultStatus?: string;
  label?: string;
  /** Renders as a small round icon-only button (for tight spaces like a Kanban column header) instead of the full pill. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => ({
    ...emptyState(),
    companyId: defaultCompanyId || "",
    clientId: defaultClientId || "",
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
      await save("/api/projects", "POST", payload(state));
      setOpen(false);
      setState({
        ...emptyState(),
        companyId: defaultCompanyId || "",
        clientId: defaultClientId || "",
        status: defaultStatus || "Idea",
      });
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
              <FormBody state={state} setState={setState} companies={companies} clients={clients} team={team} />
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

export function EditProjectButton({
  project,
  companies,
  clients = [],
  team = [],
}: {
  project: Project;
  companies: Company[];
  clients?: ClientRecord[];
  team?: TeamMember[];
}) {
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
      await save(`/api/projects/${project.id}`, "PATCH", payload(state));
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
              <FormBody state={state} setState={setState} companies={companies} clients={clients} team={team} />
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
