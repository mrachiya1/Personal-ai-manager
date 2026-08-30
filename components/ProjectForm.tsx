"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRecord, Company, Project, TeamMember } from "@/lib/types";

const STATUSES = ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"];
const PRIORITIES = ["High", "Medium", "Low"];
const SEED_CATEGORIES = ["Hotel", "3D Motion", "SaaS", "Branding", "Web", "Film", "Internal"];

/** The value the company selector uses for self-directed work. */
const PERSONAL = "__personal__";

export interface DraftTask {
  title: string;
  dueDate: string;
}

interface FormState {
  name: string;
  companyId: string;
  clientId: string;
  category: string[];
  tasks: DraftTask[];
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
    category: p?.category || [],
    tasks: [],
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
    category: state.category,
  };
}

function FormBody({
  state,
  setState,
  companies,
  clients = [],
  team = [],
  categories = SEED_CATEGORIES,
  onTasksChange,
}: {
  state: FormState;
  setState: (s: FormState) => void;
  companies: Company[];
  clients?: ClientRecord[];
  team?: TeamMember[];
  categories?: string[];
  /** Present only on create — you cannot seed milestones onto a project that
   *  already has its own. */
  onTasksChange?: boolean;
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

  // Options added while this dialog is open. The server round trip returns the
  // full list, but the `categories` prop came from a server render that has
  // not happened again yet — without this the category you just created
  // disappears from the rail the moment it is created.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);

  function toggleAssignee(id: string) {
    setState({
      ...state,
      assignedTo: state.assignedTo.includes(id)
        ? state.assignedTo.filter((x) => x !== id)
        : [...state.assignedTo, id],
    });
  }

  return (
    <div className="pf-grid">
      <div className="pf-main">
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
              const picked = e.target.value;
              // Self-directed work is work filed under NO company — the same
              // rule the Projects screen groups on — so choosing it clears
              // both fields rather than setting a flag that could disagree.
              // (It used to be "no client", which meant picking a company here
              // changed nothing on the Projects screen: every internal company
              // project still landed under Personal.)
              if (picked === PERSONAL) {
                setState({ ...state, companyId: "", clientId: "" });
                return;
              }
              // Drop a client that doesn't belong to the newly chosen company,
              // rather than filing the project under a mismatched folder.
              const keep = clients.find((c) => c.id === state.clientId);
              const clientId = !picked || !keep || keep.companyId === picked ? state.clientId : "";
              setState({ ...state, companyId: picked, clientId });
            }}
          >
            {/* One way to say "no company", not two. A bare "—" alongside
                "Personal / internal R&D" offered the same outcome twice and
                made the second look like something else. */}
            <option value={PERSONAL}>Personal / internal R&amp;D</option>
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
      {onTasksChange && (
        <div className="form-field">
          <label>First milestones</label>
          <div className="draft-tasks">
            {state.tasks.map((task, i) => (
              <div className="draft-task" key={i}>
                <input
                  value={task.title}
                  placeholder={`Milestone ${i + 1} — e.g. Wireframe`}
                  onChange={(e) => {
                    const tasks = [...state.tasks];
                    tasks[i] = { ...tasks[i], title: e.target.value };
                    setState({ ...state, tasks });
                  }}
                />
                <input
                  type="date"
                  value={task.dueDate}
                  onChange={(e) => {
                    const tasks = [...state.tasks];
                    tasks[i] = { ...tasks[i], dueDate: e.target.value };
                    setState({ ...state, tasks });
                  }}
                />
                <button
                  type="button"
                  className="draft-remove"
                  onClick={() => setState({ ...state, tasks: state.tasks.filter((_, x) => x !== i) })}
                  aria-label={`Remove milestone ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            {state.tasks.length < 5 && (
              <button
                type="button"
                className="draft-add"
                onClick={() => setState({ ...state, tasks: [...state.tasks, { title: "", dueDate: "" }] })}
              >
                + Add a milestone
              </button>
            )}
          </div>
          <p className="draft-hint">
            Created as tasks against this project, so the progress bar has something to measure from day one. Up to five.
          </p>
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
      </div>

      <aside className="pf-rail">
        <CategoryRail
          categories={extraCategories.length ? [...categories, ...extraCategories] : categories}
          chosen={state.category}
          onToggle={(c) =>
            setState({
              ...state,
              category: state.category.includes(c)
                ? state.category.filter((x) => x !== c)
                : [...state.category, c],
            })
          }
          onAdded={(name, all) => {
            // Tick it as well as adding it. Someone who just typed a category
            // name into a project form means this project to have it.
            setExtraCategories(all.filter((o) => !categories.includes(o)));
            setState({ ...state, category: [...state.category, name] });
          }}
        />
      </aside>
    </div>
  );
}

/**
 * Categories, down the side, with a way to add one.
 *
 * A rail rather than a row of chips buried between Status and Milestones.
 * Category is the field that decides how a project is found again six months
 * later, and it was getting the same three lines of the dialog as "Estimated
 * render time". Down the side it is visible while the rest of the form is
 * filled in, and it has room to grow — which it needs, because a vocabulary
 * you can add to is a vocabulary that grows.
 *
 * A new category is written into the Notion multi-select's options, not just
 * onto this project. Otherwise the second project to use it would have to
 * type it again, exactly, and one typo makes two categories that look the
 * same and filter differently.
 */
function CategoryRail({
  categories,
  chosen,
  onToggle,
  onAdded,
}: {
  categories: string[];
  chosen: string[];
  onToggle: (name: string) => void;
  onAdded: (name: string, all: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add that category");
      onAdded(clean, data.options || [...categories, clean]);
      setName("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-rail-block">
      <label className="pf-rail-label">Category</label>
      <div className="pf-cats">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`pf-cat${chosen.includes(c) ? " on" : ""}`}
            onClick={() => onToggle(c)}
            aria-pressed={chosen.includes(c)}
          >
            <span className="pf-cat-box" aria-hidden />
            <span className="pf-cat-name">{c}</span>
          </button>
        ))}
        {!categories.length && <p className="pf-rail-empty">No categories in your Notion database yet.</p>}
      </div>

      {adding ? (
        <div className="pf-cat-add">
          <input
            value={name}
            autoFocus
            placeholder="New category"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter here must not submit the project form — the person is
              // naming a category, not saying the project is finished.
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setAdding(false);
                setError(null);
              }
            }}
          />
          <button type="button" className="btn-save" onClick={add} disabled={busy || !name.trim()}>
            {busy ? "…" : "Add"}
          </button>
        </div>
      ) : (
        <button type="button" className="pf-cat-new" onClick={() => setAdding(true)}>
          + New category
        </button>
      )}
      {error && <p className="pf-rail-error">{error}</p>}
      <p className="pf-rail-hint">Added to your Notion database, so it is there next time too.</p>
    </div>
  );
}

async function save(url: string, method: string, body: unknown): Promise<{ id?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Save failed");
  return data;
}

export function NewProjectButton({
  companies,
  clients = [],
  team = [],
  categories,
  defaultCompanyId,
  defaultClientId,
  defaultStatus,
  label,
  compact,
}: {
  companies: Company[];
  clients?: ClientRecord[];
  team?: TeamMember[];
  /** The workspace's own category vocabulary, read off the Notion schema. */
  categories?: string[];
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
      const created = await save("/api/projects", "POST", payload(state));

      // Milestones are created after the project, because they need its id.
      // Sequential rather than parallel: Notion rate-limits at about three
      // requests a second, and five at once is exactly the shape that trips
      // it. A milestone that fails is reported without losing the project.
      const wanted = state.tasks.filter((t) => t.title.trim());
      const failed: string[] = [];
      if (created?.id && wanted.length) {
        for (const task of wanted) {
          try {
            await save("/api/tasks", "POST", {
              title: task.title.trim(),
              projectId: created.id,
              status: "Backlog",
              dueDate: task.dueDate || undefined,
            });
          } catch {
            failed.push(task.title.trim());
          }
        }
      }
      if (failed.length) {
        setError(`Project created, but these milestones didn't save: ${failed.join(", ")}`);
        setSaving(false);
        router.refresh();
        return;
      }

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
          <div className="modal pf-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Project</h2>
            <div className="modal-sub">Writes straight to your Notion Projects database</div>
            <form onSubmit={submit}>
              <FormBody state={state} setState={setState} companies={companies} clients={clients} team={team} categories={categories} onTasksChange />
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
          <div className="modal pf-modal" onClick={(e) => e.stopPropagation()}>
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
