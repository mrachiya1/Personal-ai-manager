"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Company, Project, Task } from "@/lib/types";
import { NewProjectButton, EditProjectButton } from "@/components/ProjectForm";
import { CalendarSyncButton } from "@/components/CalendarSyncButton";
import AiInsights from "@/components/AiInsights";

const STATUS_ORDER = ["Production", "Rendering-Ready", "Planning", "Idea", "Delivered"];

const statusBadge: Record<string, string> = {
  Idea: "badge pending",
  Planning: "badge pending",
  Production: "badge med",
  "Rendering-Ready": "badge high",
  Delivered: "badge low",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Colour is spent only where it means something: overdue, or due inside 3 days. */
function deadlineTone(deadline: string | undefined, todayISO: string, delivered: boolean) {
  if (!deadline || delivered) return "none" as const;
  if (deadline < todayISO) return "late" as const;
  if (deadline <= addDaysISO(todayISO, 3)) return "warn" as const;
  return "none" as const;
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  );
}

export default function ProjectsView({
  projects,
  companies,
  tasks,
  todayISO,
}: {
  projects: Project[];
  companies: Company[];
  tasks: Task[];
  todayISO: string;
}) {
  const [tab, setTab] = useState<"all" | "board" | "overview">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [companyFilter, setCompanyFilter] = useState<string>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const companyById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const taskStats = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const cur = map.get(t.projectId) || { total: 0, done: 0 };
      cur.total += 1;
      if (t.status === "Done") cur.done += 1;
      map.set(t.projectId, cur);
    }
    return map;
  }, [tasks]);

  const statusesPresent = useMemo(
    () => STATUS_ORDER.filter((s) => projects.some((p) => p.status === s)),
    [projects]
  );

  const companiesWithProjects = useMemo(() => {
    const ids = new Set(projects.map((p) => p.companyId));
    return companies.filter((c) => ids.has(c.id));
  }, [projects, companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (companyFilter !== "All" && p.companyId !== companyFilter) return false;
      if (!q) return true;
      const company = companyById.get(p.companyId)?.name || "";
      return [p.name, p.description || "", p.category.join(" "), company, p.status]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [projects, query, companyFilter, companyById]);

  const overdueCount = projects.filter((p) => p.deadline && p.deadline < todayISO && p.status !== "Delivered").length;
  const soonCount = projects.filter(
    (p) => p.deadline && p.deadline >= todayISO && p.deadline <= addDaysISO(todayISO, 7) && p.status !== "Delivered"
  ).length;
  const activeCount = projects.filter((p) => p.status !== "Delivered").length;
  const renderReadyCount = projects.filter((p) => p.status === "Rendering-Ready").length;

  const visibleStatuses = statusesPresent.filter((s) => statusFilter === "All" || statusFilter === s);
  const anyFilterOn = query.trim() !== "" || statusFilter !== "All" || companyFilter !== "All";

  return (
    <>
      <div className="page-tabs">
        <button className={`page-tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          All projects
        </button>
        <button className={`page-tab${tab === "board" ? " active" : ""}`} onClick={() => setTab("board")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="3" y="4" width="6" height="16" rx="1.5" />
            <rect x="10.5" y="4" width="6" height="10" rx="1.5" />
            <rect x="18" y="4" width="3" height="7" rx="1.5" />
          </svg>
          Board
        </button>
        <button className={`page-tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M3 17l5-5 4 3 8-8" />
            <path d="M15 7h5v5" />
          </svg>
          Overview
        </button>
      </div>

      {tab === "overview" ? (
        <>
          <section className="stat-grid">
            <div className="card stat-tile">
              <span className="stat-label">Total Projects</span>
              <div className="stat-value">{projects.length}</div>
              <div className="stat-delta flat">Across {companiesWithProjects.length} companies</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Active</span>
              <div className="stat-value">{activeCount}</div>
              <div className="stat-delta flat">Not yet delivered</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Rendering-Ready</span>
              <div className="stat-value">{renderReadyCount}</div>
              <div className="stat-delta flat">Queued to render</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{overdueCount > 0 ? "Overdue" : "Due This Week"}</span>
              <div className="stat-value">{overdueCount > 0 ? overdueCount : soonCount}</div>
              <div className={`stat-delta ${overdueCount > 0 ? "down" : "flat"}`}>
                {overdueCount > 0 ? "Needs attention" : soonCount > 0 ? "Coming up" : "Nothing urgent"}
              </div>
            </div>
          </section>

          <AiInsights
            scope="projects"
            title="Portfolio read"
            sub="Asks your AI model to look at every project's status, deadline and task completion, and name what actually needs attention this week."
          />
        </>
      ) : (
        <>
          <div className="section-title-row">
            <h2>{tab === "board" ? "Pipeline" : "All projects"}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <div className="search-box" style={{ minWidth: 230 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  placeholder="Search projects…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button
                className={`filter-btn${anyFilterOn || filtersOpen ? " on" : ""}`}
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
            <div className="chip-row" style={{ marginBottom: 16, alignItems: "center" }}>
              <button
                className={`filter-chip ${statusFilter === "All" ? "active" : ""}`}
                onClick={() => setStatusFilter("All")}
                type="button"
              >
                All statuses
              </button>
              {statusesPresent.map((s) => (
                <button
                  key={s}
                  className={`filter-chip ${statusFilter === s ? "active" : ""}`}
                  onClick={() => setStatusFilter(s)}
                  type="button"
                >
                  {s}
                </button>
              ))}
              {companiesWithProjects.length > 1 && (
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  style={{
                    border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12,
                    fontWeight: 600, background: "var(--surface-raised)", color: "var(--ink)", fontFamily: "inherit",
                  }}
                >
                  <option value="All">All companies</option>
                  {companiesWithProjects.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {anyFilterOn && (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => { setQuery(""); setStatusFilter("All"); setCompanyFilter("All"); }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="panel">
              <div className="dt-empty">
                {projects.length === 0
                  ? "No projects yet — use “New Project” above to add the first one."
                  : "No projects match your search or filters."}
              </div>
            </div>
          ) : tab === "all" ? (
            visibleStatuses.map((status) => {
              const rows = filtered.filter((p) => p.status === status);
              if (rows.length === 0) return null;
              return (
                <div className="panel" key={status}>
                  <div className="panel-head">
                    <span className="panel-title">{status}</span>
                    <span className="count-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="4" y="3" width="16" height="18" rx="2" />
                        <path d="M8 8h8M8 12h8M8 16h5" />
                      </svg>
                      {rows.length}
                    </span>
                    <div className="spacer" />
                    <button
                      className={`filter-btn${filtersOpen ? " on" : ""}`}
                      type="button"
                      onClick={() => setFiltersOpen((v) => !v)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 5h18M6 12h12M10 19h4" />
                      </svg>
                      Filter
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="dt">
                      <thead>
                        <tr>
                          <th style={{ width: "26%" }}>Project name</th>
                          <th style={{ width: "16%" }}>Company</th>
                          <th style={{ width: "16%" }}>Type</th>
                          <th style={{ width: "16%" }}>Timeline</th>
                          <th style={{ width: "11%" }}>Priority</th>
                          <th style={{ width: "15%" }}>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => (
                          <ProjectRow
                            key={p.id}
                            p={p}
                            company={companyById.get(p.companyId)}
                            companies={companies}
                            stats={taskStats.get(p.id)}
                            todayISO={todayISO}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          ) : (
            <BoardView
              statuses={statusesPresent}
              projects={filtered}
              companies={companies}
              taskStats={taskStats}
              todayISO={todayISO}
            />
          )}
        </>
      )}
    </>
  );
}

function ProjectRow({
  p,
  company,
  companies,
  stats,
  todayISO,
}: {
  p: Project;
  company?: Company;
  companies: Company[];
  stats?: { total: number; done: number };
  todayISO: string;
}) {
  const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const tone = deadlineTone(p.deadline, todayISO, p.status === "Delivered");
  const priority = (p.renderPriority || "").toLowerCase();

  return (
    <tr>
      <td className="cell-name">
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            className="nav-swatch"
            style={{ background: company ? `var(${company.colorVar})` : "var(--ink-muted)", width: 20, height: 20, borderRadius: 6 }}
          >
            {initials(p.name)}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </span>
            {p.description && (
              <span
                className="cell-muted"
                style={{ display: "block", fontSize: 11.5, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}
              >
                {p.description}
              </span>
            )}
          </span>
        </div>
      </td>

      <td>
        {company ? (
          <Link href={`/companies/${company.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="company-dot" style={{ background: `var(${company.colorVar})` }} />
            <span style={{ color: "var(--ink-secondary)" }}>{company.name}</span>
          </Link>
        ) : (
          <span className="cell-muted">—</span>
        )}
      </td>

      <td>
        {p.category.length > 0 ? (
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
            <span className="type-pill">
              <TagIcon />
              {p.category[0]}
            </span>
            {p.category.length > 1 && (
              <span className="cell-muted" title={p.category.slice(1).join(", ")}>
                +{p.category.length - 1}
              </span>
            )}
          </span>
        ) : (
          <span className="cell-muted">—</span>
        )}
      </td>

      <td className="cell-nowrap">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: tone === "late" ? "#b23636" : tone === "warn" ? "#93630f" : "var(--ink-secondary)",
            fontWeight: tone === "none" ? 400 : 600,
          }}
        >
          <span style={{ width: 12, height: 12, display: "inline-flex", opacity: 0.7 }}>
            <CalIcon />
          </span>
          {prettyDate(p.deadline)}
          {tone === "late" && " · overdue"}
        </span>
      </td>

      <td>
        {p.renderPriority ? (
          <span className={`prio ${priority}`}>{p.renderPriority}</span>
        ) : (
          <span className="prio none">—</span>
        )}
      </td>

      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="progress-cell">
            <span className="pct">{stats && stats.total > 0 ? `${pct}%` : "—"}</span>
            <span className="bar">
              <i className={tone === "late" ? "late" : pct >= 100 ? "" : tone === "warn" ? "warn" : ""} style={{ width: `${pct}%` }} />
            </span>
          </div>
          <div className="row-actions">
            {p.deadline && <CalendarSyncButton summary={p.name} date={p.deadline} description={p.description} />}
            <EditProjectButton project={p} companies={companies} />
          </div>
        </div>
      </td>
    </tr>
  );
}

function BoardView({
  statuses,
  projects,
  companies,
  taskStats,
  todayISO,
}: {
  statuses: string[];
  projects: Project[];
  companies: Company[];
  taskStats: Map<string, { total: number; done: number }>;
  todayISO: string;
}) {
  return (
    <div className="board-scroll">
      {statuses.map((status) => {
        const rows = projects.filter((p) => p.status === status);
        return (
          <div className="board-col" key={status}>
            <div className="board-col-head">
              <div className="left">
                <span className={statusBadge[status] ?? "badge pending"}>{status}</span>
                <span className="count">{rows.length}</span>
              </div>
              <NewProjectButton companies={companies} defaultStatus={status} compact label={`New in ${status}`} />
            </div>
            {rows.length === 0 ? (
              <div className="board-empty">Nothing here</div>
            ) : (
              rows.map((p) => {
                const company = companies.find((c) => c.id === p.companyId);
                const stats = taskStats.get(p.id);
                const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
                const tone = deadlineTone(p.deadline, todayISO, p.status === "Delivered");
                return (
                  <div className="board-card" key={p.id}>
                    <div className="meta-row">
                      <div className="name">{p.name}</div>
                      <EditProjectButton project={p} companies={companies} />
                    </div>
                    {company && (
                      <Link href={`/companies/${company.id}`} className="company-link" style={{ color: "var(--ink-muted)" }}>
                        <span className="company-dot" style={{ background: `var(${company.colorVar})` }} />
                        {company.name}
                      </Link>
                    )}
                    <div className="meta-row">
                      {stats && stats.total > 0 ? (
                        <div className="progress-cell" style={{ minWidth: 0, flex: 1 }}>
                          <span className="pct">{pct}%</span>
                          <span className="bar">
                            <i className={tone === "late" ? "late" : ""} style={{ width: `${pct}%` }} />
                          </span>
                        </div>
                      ) : (
                        <span />
                      )}
                      {p.deadline && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: tone === "none" ? 400 : 600,
                            color: tone === "late" ? "#b23636" : tone === "warn" ? "#93630f" : "var(--ink-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {prettyDate(p.deadline)}
                        </span>
                      )}
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
