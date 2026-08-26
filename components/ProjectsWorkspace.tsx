"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRecord, Company, Project, Task, TeamMember } from "@/lib/types";
import { NewProjectButton, EditProjectButton } from "@/components/ProjectForm";
import AiInsights from "@/components/AiInsights";
import FolderTree from "@/components/projects/FolderTree";
import ProjectFiles from "@/components/projects/ProjectFiles";
import {
  AvatarStack,
  DateCell,
  MultiPickCell,
  NumberCell,
  SelectCell,
  TextCell,
  avatarColor,
  initials,
  type PickOption,
} from "@/components/projects/cells";

const STATUSES = ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"];
const PRIORITIES = ["High", "Medium", "Low"];

const statusBadge: Record<string, string> = {
  Idea: "badge pending",
  Planning: "badge pending",
  Production: "badge med",
  "Rendering-Ready": "badge high",
  Delivered: "badge low",
};

/** Days from today to an ISO date. Negative = in the past. */
function daysUntil(iso: string | undefined, todayISO: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso}T12:00:00Z`);
  const b = Date.parse(`${todayISO}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DaysChip({ days }: { days: number }) {
  if (days < 0) return <span className="pw-days late">{Math.abs(days)}d over</span>;
  if (days === 0) return <span className="pw-days late">today</span>;
  return <span className="pw-days soon">{days}d left</span>;
}

export default function ProjectsWorkspace({
  projects,
  companies,
  clients,
  team,
  tasks,
  todayISO,
  clientByProjectFallback,
  schemaReady,
}: {
  projects: Project[];
  companies: Company[];
  clients: ClientRecord[];
  team: TeamMember[];
  tasks: Task[];
  todayISO: string;
  /** projectId -> clientId, joined via Payments, for databases predating the Client property. */
  clientByProjectFallback: Record<string, string>;
  schemaReady: boolean;
}) {
  const [rows, setRows] = useState<Project[]>(projects);
  const [taskRows, setTaskRows] = useState<Task[]>(tasks);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [tab, setTab] = useState<"all" | "folders" | "board" | "overview">("all");
  const [treeSelection, setTreeSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Which inline picker is open, as "<projectId>:<field>".
   *
   * This lives in the parent on purpose. The row components below are
   * declared inside this function, so every render hands React a new
   * component identity and the whole row subtree remounts — taking any
   * local state with it. Since each tick of a multi-select saves, and
   * saving re-renders, a popover owning its own open state closed itself
   * after a single pick: Assigned and Category could never hold more than
   * one value. Holding it here survives the remount.
   */
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerProps = useCallback(
    (key: string) => ({
      open: openPicker === key,
      onOpenChange: (next: boolean) => {
        setOpenPicker(next ? key : null);
        setPickerQuery("");
      },
    }),
    [openPicker],
  );
  const multiPickProps = useCallback(
    (key: string) => ({ ...pickerProps(key), query: pickerQuery, onQueryChange: setPickerQuery }),
    [pickerProps, pickerQuery],
  );
  const router = useRouter();

  /* ---------- lookups ---------- */
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const teamById = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);

  const teamOptions: PickOption[] = useMemo(
    () => team.filter((t) => t.status !== "Inactive").map((t) => ({ id: t.id, label: t.name })),
    [team]
  );
  const clientOptions = useMemo(() => clients.map((c) => c.name), [clients]);
  const categoryOptions: PickOption[] = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) p.category.forEach((c) => set.add(c));
    return [...set].sort().map((c) => ({ id: c, label: c }));
  }, [projects]);

  const effectiveClientId = useCallback(
    (p: Project) => p.clientId || clientByProjectFallback[p.id] || "",
    [clientByProjectFallback]
  );

  /** How many projects we run for each client — shown on the section chip. */
  const clientProjectCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      const cid = effectiveClientId(p);
      m.set(cid, (m.get(cid) || 0) + 1);
    }
    return m;
  }, [rows, effectiveClientId]);

  const taskStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const t of taskRows) {
      if (!t.projectId) continue;
      const cur = m.get(t.projectId) || { total: 0, done: 0 };
      cur.total += 1;
      if (t.status === "Done") cur.done += 1;
      m.set(t.projectId, cur);
    }
    return m;
  }, [taskRows]);

  /* ---------- persistence ---------- */

  /** Optimistic save. The row updates instantly and rolls back if Notion refuses. */
  const patch = useCallback(
    async (id: string, changes: Partial<Project>, body: Record<string, unknown>) => {
      const before = rows;
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
      setToast({ text: "Saving…" });
      try {
        const res = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Notion refused that change");
        setRows((prev) =>
          prev.map((p) => (p.id === id ? { ...p, lastEditedTime: new Date().toISOString() } : p))
        );
        setToast({ text: "Saved" });
        setTimeout(() => setToast(null), 1200);
      } catch (err) {
        setRows(before);
        setToast({ text: err instanceof Error ? err.message : "Save failed", err: true });
        setTimeout(() => setToast(null), 4000);
      }
    },
    [rows]
  );

  const toggleTask = useCallback(
    async (task: Task) => {
      const next = task.status === "Done" ? "Backlog" : "Done";
      const before = taskRows;
      setTaskRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next as Task["status"] } : t)));
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't update that task");
      } catch (err) {
        setTaskRows(before);
        setToast({ text: err instanceof Error ? err.message : "Save failed", err: true });
        setTimeout(() => setToast(null), 4000);
      }
    },
    [taskRows]
  );

  /* ---------- filtering, urgency, grouping ---------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== "All" && p.status !== statusFilter) return false;
      if (!q) return true;
      const client = clientById.get(effectiveClientId(p))?.name || "";
      const people = p.assignedTo.map((id) => teamById.get(id)?.name || "").join(" ");
      return [p.name, p.headline || "", p.description || "", p.category.join(" "), client, people, p.status]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, statusFilter, clientById, teamById, effectiveClientId]);

  /** Overdue or due within a week, still live. Nearest first. */
  const urgent = useMemo(
    () =>
      filtered
        .filter((p) => {
          if (p.status === "Delivered") return false;
          const d = daysUntil(p.deadline, todayISO);
          return d !== null && d <= 7;
        })
        .sort((a, b) => (daysUntil(a.deadline, todayISO)! - daysUntil(b.deadline, todayISO)!)),
    [filtered, todayISO]
  );
  const urgentIds = useMemo(() => new Set(urgent.map((p) => p.id)), [urgent]);

  /** Everything else, bucketed by client, each bucket deadline-sorted. */
  const clientGroups = useMemo(() => {
    const groups = new Map<string, Project[]>();
    for (const p of filtered) {
      if (urgentIds.has(p.id)) continue;
      const cid = effectiveClientId(p);
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid)!.push(p);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const da = daysUntil(a.deadline, todayISO);
        const db = daysUntil(b.deadline, todayISO);
        if (da === null && db === null) return a.name.localeCompare(b.name);
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }
    return [...groups.entries()].sort((a, b) => {
      // Projects with no client sink to the bottom; the rest go alphabetically.
      if (!a[0]) return 1;
      if (!b[0]) return -1;
      return (clientById.get(a[0])?.name || "").localeCompare(clientById.get(b[0])?.name || "");
    });
  }, [filtered, urgentIds, effectiveClientId, clientById, todayISO]);

  /* ---------- shared cell renderers ---------- */

  function renderRowCells(p: Project) {
    const company = companyById.get(p.companyId);
    const cid = effectiveClientId(p);
    const client = clientById.get(cid);
    const people = p.assignedTo.map((id) => ({ id, label: teamById.get(id)?.name || "Unknown" }));
    const reviewers = p.reviewedBy.map((id) => ({ id, label: teamById.get(id)?.name || "Unknown" }));
    const stats = taskStats.get(p.id);
    const pct = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    const dLeft = daysUntil(p.deadline, todayISO);
    const tone: "late" | "soon" | null =
      p.status === "Delivered" || dLeft === null ? null : dLeft < 0 ? "late" : dLeft <= 3 ? "soon" : null;
    return { company, cid, client, people, reviewers, stats, pct, dLeft, tone };
  }

  const isOpen = (id: string) => expanded.has(id);
  const toggleOpen = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /* ---------- render ---------- */

  const totalValue = filtered.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <>
      <div className="page-tabs">
        {([
          ["all", "All projects"],
          ["folders", "Folders"],
          ["board", "Board"],
          ["overview", "Overview"],
        ] as const).map(([id, label]) => (
          <button key={id} className={`page-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {!schemaReady && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", marginBottom: 14,
            borderRadius: 11, background: "var(--warning-bg)", border: "1px solid rgba(250,178,25,0.3)", flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#8a5a00", flex: 1, minWidth: 200 }}>
            <strong>Some columns are missing from Notion.</strong> Assignee, value, start date, headline, client
            requests and review tracking need fields your Projects database doesn&apos;t have yet.
          </div>
          <Link href="/settings" className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8 }}>
            Add them
          </Link>
        </div>
      )}

      {tab === "overview" ? (
        <>
          <section className="stat-grid">
            <div className="card stat-tile">
              <span className="stat-label">Projects</span>
              <div className="stat-value">{rows.length}</div>
              <div className="stat-delta flat">{clientProjectCount.size} clients</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Needs attention</span>
              <div className="stat-value">{urgent.length}</div>
              <div className={`stat-delta ${urgent.length ? "down" : "flat"}`}>
                {urgent.length ? "Due within 7 days" : "Nothing urgent"}
              </div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Active</span>
              <div className="stat-value">{rows.filter((p) => p.status !== "Delivered").length}</div>
              <div className="stat-delta flat">Not yet delivered</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Pipeline value</span>
              <div className="stat-value">{totalValue ? totalValue.toLocaleString() : "—"}</div>
              <div className="stat-delta flat">Across shown projects</div>
            </div>
          </section>
          <AiInsights
            scope="projects"
            title="Portfolio read"
            sub="Looks at every project's status, deadline and task completion and names what actually needs attention."
          />
        </>
      ) : (
        <>
          <div className="section-title-row">
            <h2>{tab === "board" ? "Pipeline" : "All projects"}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <div className="search-box" style={{ minWidth: 210 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input placeholder="Search projects, people, clients…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <button
                className={`filter-btn${statusFilter !== "All" || filtersOpen ? " on" : ""}`}
                onClick={() => setFiltersOpen((v) => !v)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 5h18M6 12h12M10 19h4" />
                </svg>
                Filter
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="chip-row" style={{ marginBottom: 16 }}>
              <button className={`filter-chip ${statusFilter === "All" ? "active" : ""}`} onClick={() => setStatusFilter("All")} type="button">
                All statuses
              </button>
              {STATUSES.map((s) => (
                <button key={s} className={`filter-chip ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)} type="button">
                  {s}
                </button>
              ))}
            </div>
          )}

          {tab === "folders" ? (
            <div className="pw-folders">
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="panel-head">
                  <span className="panel-title">Company · Client · Project</span>
                  <span className="count-chip">{filtered.length}</span>
                </div>
                <FolderTree
                  projects={filtered}
                  companies={companies}
                  clients={clients}
                  clientFor={effectiveClientId}
                  selectedId={treeSelection ?? undefined}
                  onSelect={(p) => setTreeSelection(p.id)}
                  counts={{
                    overdue: (p) => {
                      const d = daysUntil(p.deadline, todayISO);
                      return p.status !== "Delivered" && d !== null && d < 0;
                    },
                  }}
                />
              </div>

              <div>
                {(() => {
                  const selected = filtered.find((p) => p.id === treeSelection) || filtered[0];
                  if (!selected) {
                    return (
                      <div className="panel">
                        <div className="dt-empty">Nothing to show.</div>
                      </div>
                    );
                  }
                  const c = cellsFor(selected);
                  const client = clientById.get(effectiveClientId(selected));
                  return (
                    <div className="panel">
                      <div className="panel-head">
                        <span className="panel-title">{selected.name}</span>
                        {c.urgencyChip}
                        <div className="spacer" />
                        <span className={statusBadge[selected.status] ?? "badge pending"}>{selected.status}</span>
                      </div>
                      <div className="pw-detail" style={{ paddingLeft: 20 }}>
                        <div className="pw-detail-grid">
                          <div>
                            <div className="pw-field-label">Client</div>
                            {c.clientCell}
                          </div>
                          <div>
                            <div className="pw-field-label">Assigned</div>
                            {c.assigned}
                          </div>
                          <div>
                            <div className="pw-field-label">Timeline</div>
                            {c.timeline}
                          </div>
                          <div>
                            <div className="pw-field-label">Value</div>
                            {c.value}
                          </div>
                        </div>
                        {c.detail}
                        <ProjectFiles
                          projectId={selected.id}
                          files={selected.files}
                          companyName={companyById.get(selected.companyId)?.name}
                          projectName={selected.name}
                        />
                        {client && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                            {clientProjectCount.get(client.id) || 1} project
                            {(clientProjectCount.get(client.id) || 1) === 1 ? "" : "s"} running for {client.name}.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : tab === "board" ? (
            <BoardView
              rows={filtered}
              companies={companies}
              clients={clients}
              team={team}
              taskStats={taskStats}
              todayISO={todayISO}
              onStatus={(p, status) => patch(p.id, { status: status as Project["status"] }, { status })}
            />
          ) : filtered.length === 0 ? (
            <div className="panel">
              <div className="dt-empty">
                {rows.length === 0 ? "No projects yet — add the first one above." : "Nothing matches your search."}
              </div>
            </div>
          ) : (
            <>
              {urgent.length > 0 && (
                <Section
                  title="Needs attention"
                  count={urgent.length}
                  urgent
                  subtitle="Overdue, or due within 7 days — soonest first"
                  list={urgent}
                />
              )}

              {clientGroups.map(([cid, list]) => {
                const client = clientById.get(cid);
                return (
                  <Section
                    key={cid || "none"}
                    title={client ? client.name : "No client assigned"}
                    count={clientProjectCount.get(cid) || list.length}
                    countLabel="projects we are running for this client"
                    href={client ? "/clients" : undefined}
                    list={list}
                  />
                );
              })}
            </>
          )}
        </>
      )}

      {toast && <div className={`pw-saving${toast.err ? " err" : ""}`}>{toast.text}</div>}
    </>
  );

  /* ---------- inner components (closure over state) ---------- */

  /**
   * A titled group. Renders the same projects twice by design — as table rows
   * for the desktop layout and as cards for the mobile one — because a `<div>`
   * is not legal inside `<tbody>`, so the two cannot share a single subtree.
   * CSS shows exactly one of them at any width.
   */
  function Section({
    title,
    count,
    countLabel,
    subtitle,
    urgent: isUrgent,
    href,
    list,
  }: {
    title: string;
    count: number;
    countLabel?: string;
    subtitle?: string;
    urgent?: boolean;
    href?: string;
    list: Project[];
  }) {
    return (
      <div className="panel">
        <div className={`panel-head${isUrgent ? " pw-urgent-head" : ""}`}>
          <span className="panel-title">{href ? <Link href={href}>{title}</Link> : title}</span>
          <span className="count-chip" title={countLabel}>{count}</span>
          {subtitle && <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>{subtitle}</span>}
          <div className="spacer" />
        </div>

        <div className="pw-table-wrap table-scroll">
          {/* Fixed layout, identical widths in every section — otherwise each
              table sizes to its own content and the columns stop lining up
              between one client group and the next. */}
          <table className="dt pw-table">
            <colgroup>
              <col style={{ width: 250 }} />
              <col style={{ width: 128 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 138 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Assigned</th>
                <th>Timeline</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Value</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          {list.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      </div>
    );
  }

  /** Every editable cell for one project, built once and shared by both layouts. */
  function cellsFor(p: Project) {
    const { client, people, reviewers, stats, pct, dLeft, tone } = renderRowCells(p);
    const open = isOpen(p.id);
    const projectTasks = taskRows.filter((t) => t.projectId === p.id);

    const expandButton = (
      <button className={`pw-expand${open ? " open" : ""}`} onClick={() => toggleOpen(p.id)} aria-label="Toggle detail">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    );

    const urgencyChip =
      dLeft !== null && p.status !== "Delivered" && dLeft <= 7 ? <DaysChip days={dLeft} /> : null;

    const category = (
      <MultiPickCell
        selected={p.category}
        options={categoryOptions}
        heading="Category"
        {...multiPickProps(`${p.id}:category`)}
        placeholder="Tag"
        onSave={(cat) => patch(p.id, { category: cat }, { category: cat })}
        renderClosed={(chosen) => (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
            <span className="type-pill">{chosen[0].label}</span>
            {chosen.length > 1 && <span className="cell-muted">+{chosen.length - 1}</span>}
          </span>
        )}
      />
    );

    const name = (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        {expandButton}
        <div style={{ minWidth: 0, flex: 1 }}>
          <TextCell value={p.name} bold onSave={(name) => patch(p.id, { name }, { name })} placeholder="Untitled project" />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1, minWidth: 0 }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <TextCell
                value={p.headline || ""}
                placeholder="Add a headline…"
                onSave={(headline) => patch(p.id, { headline }, { headline })}
              />
            </span>
            <span style={{ flexShrink: 0 }}>{category}</span>
          </div>
        </div>
      </div>
    );

    const clientCell = (
      <SelectCell
        value={client?.name}
        options={clientOptions}
        placeholder="Set client"
        {...pickerProps(`${p.id}:client`)}
        onSave={(nextName) => {
          const match = clients.find((c) => c.name === nextName);
          patch(p.id, { clientId: match?.id }, { clientId: match?.id || "" });
        }}
        render={(nextName) => {
          const c = clients.find((x) => x.name === nextName);
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span className="company-dot" style={{ background: c ? avatarColor(c.id) : "var(--ink-muted)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nextName}</span>
            </span>
          );
        }}
      />
    );

    const assigned = (
      <MultiPickCell
        selected={p.assignedTo}
        options={teamOptions}
        heading="Assign to"
        {...multiPickProps(`${p.id}:assigned`)}
        searchable
        placeholder="Assign"
        onSave={(assignedTo) => patch(p.id, { assignedTo }, { assignedTo })}
        renderClosed={(chosen) => <AvatarStack people={chosen} max={3} />}
      />
    );

    const timeline = (
      <div className="pw-timeline">
        <DateCell value={p.startDate} placeholder="Start" onSave={(startDate) => patch(p.id, { startDate }, { startDate })} />
        <span style={{ color: "var(--ink-muted)", flexShrink: 0 }}>–</span>
        <DateCell value={p.deadline} placeholder="Deadline" tone={tone} onSave={(deadline) => patch(p.id, { deadline }, { deadline })} />
        {urgencyChip}
      </div>
    );

    const priority = (
      <SelectCell
        value={p.renderPriority}
        options={PRIORITIES}
        {...pickerProps(`${p.id}:priority`)}
        placeholder="—"
        onSave={(rp) => patch(p.id, { renderPriority: (rp || undefined) as Project["renderPriority"] }, { renderPriority: rp })}
        render={(v) => <span className={`prio ${v.toLowerCase()}`}>{v}</span>}
      />
    );

    const status = (
      <SelectCell
        value={p.status}
        options={STATUSES}
        {...pickerProps(`${p.id}:status`)}
        allowEmpty={false}
        onSave={(st) => patch(p.id, { status: st as Project["status"] }, { status: st })}
        render={(v) => <span className={statusBadge[v] ?? "badge pending"}>{v}</span>}
      />
    );

    const value = <NumberCell value={p.value} onSave={(v) => patch(p.id, { value: v }, { value: v ?? "" })} />;

    const progress = (
      <div className="progress-cell">
        <span className="pct">{stats && stats.total ? `${pct}%` : "—"}</span>
        <span className="bar">
          <i className={tone === "late" ? "late" : tone === "soon" ? "warn" : ""} style={{ width: `${pct}%` }} />
        </span>
      </div>
    );

    const detail = (
      <div className="pw-detail">
        <div>
          <div className="pw-field-label">
            Project breakdown · {stats?.done ?? 0} of {stats?.total ?? 0} done
          </div>
          {projectTasks.length === 0 ? (
            <div className="pw-field-value" style={{ color: "var(--ink-muted)" }}>
              No tasks linked to this project yet.
            </div>
          ) : (
            <div>
              {projectTasks.map((t) => (
                <div key={t.id} className={`pw-check-row${t.status === "Done" ? " done" : ""}`}>
                  <button
                    className={`pw-check${t.status === "Done" ? " done" : ""}`}
                    onClick={() => toggleTask(t)}
                    aria-label={t.status === "Done" ? "Mark not done" : "Mark done"}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </button>
                  <span className="pw-check-title">{t.title}</span>
                  {t.dueDate && <span className="pw-check-due">{t.dueDate}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pw-detail-grid">
          <div>
            <div className="pw-field-label">Description</div>
            <TextCell
              value={p.description || ""}
              multiline
              placeholder="What is this project?"
              onSave={(description) => patch(p.id, { description }, { description })}
            />
          </div>
          <div>
            <div className="pw-field-label">Client requests</div>
            <TextCell
              value={p.clientRequests || ""}
              multiline
              placeholder="Extra things the client has asked for…"
              onSave={(clientRequests) => patch(p.id, { clientRequests }, { clientRequests })}
            />
          </div>
        </div>

        <div className="pw-detail-grid">
          <div>
            <div className="pw-field-label">Last reviewed</div>
            <DateCell
              value={p.lastReviewed}
              placeholder="Not reviewed yet"
              onSave={(lastReviewed) => patch(p.id, { lastReviewed }, { lastReviewed })}
            />
          </div>
          <div>
            <div className="pw-field-label">Checked by</div>
            <MultiPickCell
              selected={p.reviewedBy}
              options={teamOptions}
              heading="Reviewed by"
              {...multiPickProps(`${p.id}:reviewedBy`)}
              searchable
              placeholder="Who checked it?"
              onSave={(reviewedBy) => patch(p.id, { reviewedBy }, { reviewedBy })}
              renderClosed={(chosen) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <AvatarStack people={chosen} max={3} />
                  <span style={{ fontSize: 12 }}>{chosen.map((c) => c.label).join(", ")}</span>
                </span>
              )}
            />
          </div>
          <div>
            <div className="pw-field-label">Last updated</div>
            <div className="pw-field-value">{relativeTime(p.lastEditedTime)}</div>
          </div>
          <div>
            <div className="pw-field-label">Est. render time (hrs)</div>
            <NumberCell
              value={p.estimatedRenderHours}
              onSave={(h) => patch(p.id, { estimatedRenderHours: h }, { estimatedRenderHours: h ?? "" })}
            />
          </div>
        </div>

        <ProjectFiles
          projectId={p.id}
          files={p.files}
          companyName={companyById.get(p.companyId)?.name}
          projectName={p.name}
        />

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <EditProjectButton project={p} companies={companies} clients={clients} team={team} />
          {reviewers.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
              Last checked by {reviewers.map((r) => r.label).join(", ")}
              {p.lastReviewed ? ` on ${p.lastReviewed}` : ""}
            </span>
          )}
        </div>
      </div>
    );

    return { open, name, clientCell, assigned, category, timeline, priority, status, value, progress, detail, people, urgencyChip, expandButton };
  }

  function ProjectRow({ p }: { p: Project }) {
    const c = cellsFor(p);
    return (
      <>
        <tr>
          <td className="cell-name">{c.name}</td>
          <td>{c.clientCell}</td>
          <td>{c.assigned}</td>
          <td>{c.timeline}</td>
          <td>{c.priority}</td>
          <td>{c.status}</td>
          <td>{c.value}</td>
          <td>{c.progress}</td>
        </tr>
        {c.open && (
          <tr>
            <td className="pw-detail-cell" colSpan={8}>
              {c.detail}
            </td>
          </tr>
        )}
      </>
    );
  }

  function ProjectCard({ p }: { p: Project }) {
    const c = cellsFor(p);
    return (
      <div className="pw-card">
        <div className="pw-card-top">
          {c.expandButton}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pw-card-name">{p.name}</div>
            {p.headline && <div className="pw-card-head">{p.headline}</div>}
          </div>
          {c.urgencyChip}
        </div>
        <div className="pw-card-meta">
          {c.status}
          {c.priority}
          {c.people.length > 0 && <AvatarStack people={c.people} max={3} />}
        </div>
        <div className="pw-card-row"><span className="k">Client</span><span className="v">{c.clientCell}</span></div>
        <div className="pw-card-row"><span className="k">Timeline</span><span className="v">{c.timeline}</span></div>
        <div className="pw-card-row"><span className="k">Value</span><span className="v">{c.value}</span></div>
        <div className="pw-card-row"><span className="k">Progress</span><span className="v">{c.progress}</span></div>
        {c.open && c.detail}
      </div>
    );
  }
}

/* ------------------------------------------------------------------ */

function BoardView({
  rows,
  companies,
  clients,
  team,
  taskStats,
  todayISO,
  onStatus,
}: {
  rows: Project[];
  companies: Company[];
  clients: ClientRecord[];
  team: TeamMember[];
  taskStats: Map<string, { total: number; done: number }>;
  todayISO: string;
  onStatus: (p: Project, status: string) => void;
}) {
  const present = STATUSES.filter((s) => rows.some((p) => p.status === s));
  return (
    <div className="board-scroll">
      {present.map((status) => {
        const list = rows.filter((p) => p.status === status);
        return (
          <div className="board-col" key={status}>
            <div className="board-col-head">
              <div className="left">
                <span className={statusBadge[status] ?? "badge pending"}>{status}</span>
                <span className="count">{list.length}</span>
              </div>
              <NewProjectButton companies={companies} clients={clients} team={team} defaultStatus={status} compact label={`New in ${status}`} />
            </div>
            {list.length === 0 ? (
              <div className="board-empty">Nothing here</div>
            ) : (
              list.map((p) => {
                const stats = taskStats.get(p.id);
                const pct = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
                const d = daysUntil(p.deadline, todayISO);
                return (
                  <div className="board-card" key={p.id}>
                    <div className="meta-row">
                      <div className="name">{p.name}</div>
                      {d !== null && p.status !== "Delivered" && d <= 7 && <DaysChip days={d} />}
                    </div>
                    {p.headline && (
                      <div style={{ fontSize: 11, color: "var(--ink-muted)", lineHeight: 1.45 }}>{p.headline}</div>
                    )}
                    <div className="meta-row">
                      <div className="progress-cell" style={{ minWidth: 0, flex: 1 }}>
                        <span className="pct">{stats && stats.total ? `${pct}%` : "—"}</span>
                        <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                      </div>
                      <select
                        value={p.status}
                        onChange={(e) => onStatus(p, e.target.value)}
                        style={{
                          fontSize: 10.5, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 6,
                          padding: "2px 5px", background: "var(--surface-raised)", color: "var(--ink-secondary)",
                          fontFamily: "inherit",
                        }}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
