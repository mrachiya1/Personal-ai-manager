"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRecord, Company, Project, Task, TeamMember } from "@/lib/types";
import { NewProjectButton } from "@/components/ProjectForm";
import AiInsights from "@/components/AiInsights";
import FolderTree from "@/components/projects/FolderTree";
import BoardView from "@/components/projects/BoardView";
import ProjectTree, { STATUSES, type TreeHandlers } from "@/components/projects/ProjectTree";
import ProjectsMetricsRow from "@/components/projects/ProjectsMetrics";
import CompletionFeedback from "@/components/projects/CompletionFeedback";
import ResourcesModal from "@/components/projects/ResourcesModal";
import { buildRows, computeMetrics, sectionise, type ProjectRow } from "@/lib/projectsAnalytics";
import type { PickOption } from "@/components/projects/editable";

type Tab = "projects" | "board" | "folders";

const TABS: [Tab, string][] = [
  ["projects", "Projects"],
  ["board", "Board"],
  ["folders", "Folders"],
];

/**
 * The Projects workspace.
 *
 * Every subcomponent lives at module scope on purpose. An earlier version
 * declared the row components inside this function, which handed React a new
 * component identity on every render and remounted the whole subtree — so a
 * multi-select popover closed itself after a single pick, and no assignee
 * could ever hold two names. Keeping them out here is what makes inline
 * editing survive a save.
 */
export default function ProjectsWorkspace({
  projects,
  companies,
  clients,
  team,
  tasks,
  payments,
  todayISO,
  schemaReady,
  currency,
}: {
  projects: Project[];
  companies: Company[];
  clients: ClientRecord[];
  team: TeamMember[];
  tasks: Task[];
  payments: import("@/lib/types").Payment[];
  todayISO: string;
  schemaReady: boolean;
  currency: string;
}) {
  const [rows, setRows] = useState<Project[]>(projects);
  const [taskRows, setTaskRows] = useState<Task[]>(tasks);
  const [tab, setTab] = useState<Tab>("projects");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [resourcesFor, setResourcesFor] = useState<ProjectRow | null>(null);
  const [completionFor, setCompletionFor] = useState<ProjectRow | null>(null);
  const [treeSelection, setTreeSelection] = useState<string | null>(null);
  const router = useRouter();

  /* ---------- options for the pickers ---------- */
  const clientOptions = useMemo(() => clients.map((c) => c.name).sort(), [clients]);
  const teamOptions = useMemo<PickOption[]>(
    () => team.map((m) => ({ id: m.id, label: m.name, colorSeed: m.id })),
    [team]
  );
  const categoryOptions = useMemo<PickOption[]>(() => {
    const seen = new Set<string>();
    for (const p of rows) for (const c of p.category) seen.add(c);
    for (const c of ["Hotel", "3D Motion", "SaaS", "Branding", "Web", "Film", "Internal"]) seen.add(c);
    return [...seen].sort().map((c) => ({ id: c, label: c }));
  }, [rows]);

  /* ---------- derived ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== "All" && p.status !== statusFilter) return false;
      if (!q) return true;
      const client = clients.find((c) => c.id === p.clientId)?.name ?? "";
      const company = companies.find((c) => c.id === p.companyId)?.name ?? "";
      return [p.name, p.headline, client, company, ...p.category].join(" ").toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter, clients, companies]);

  const allRows = useMemo(
    () => buildRows({ projects: rows, clients, companies, team, tasks: taskRows, payments, todayISO }),
    [rows, clients, companies, team, taskRows, payments, todayISO]
  );
  const filteredRows = useMemo(
    () => buildRows({ projects: filtered, clients, companies, team, tasks: taskRows, payments, todayISO }),
    [filtered, clients, companies, team, taskRows, payments, todayISO]
  );

  // The headline metrics read the whole workspace, never the filtered view —
  // a search box that silently changes what "total projects" means is a lie.
  const metrics = useMemo(() => computeMetrics(allRows, todayISO), [allRows, todayISO]);
  const sections = useMemo(() => sectionise(filteredRows, companies), [filteredRows, companies]);
  const taskStats = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const t of taskRows) {
      const s = map.get(t.projectId) ?? { total: 0, done: 0 };
      s.total += 1;
      if (t.status === "Done") s.done += 1;
      map.set(t.projectId, s);
    }
    return map;
  }, [taskRows]);

  /* ---------- writes ---------- */

  /**
   * Optimistic, with rollback.
   *
   * The row changes before the request leaves, and goes back to exactly what
   * it was if Notion refuses — the toast says which field failed rather than
   * "save failed", because on a table this wide that is the only useful part.
   */
  const patch = useCallback(
    async (id: string, changes: Record<string, unknown>, body: Record<string, unknown>) => {
      // A client is chosen by name in the UI but stored as a relation.
      let payload = body;
      let applied = changes;
      if ("clientName" in body) {
        const match = clients.find((c) => c.name === body.clientName);
        payload = { clientId: match?.id || "" };
        applied = { clientId: match?.id };
      }

      const before = rows;
      setRows((prev) => prev.map((p) => (p.id === id ? ({ ...p, ...applied } as Project) : p)));
      setToast({ text: "Saving…" });
      try {
        const res = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the change");
        setToast({ text: "Saved" });
        setTimeout(() => setToast(null), 1200);
        router.refresh();
      } catch (err) {
        setRows(before);
        setToast({ text: `${Object.keys(payload)[0]}: ${err instanceof Error ? err.message : "save failed"}`, err: true });
      }
    },
    [rows, clients, router]
  );

  const patchTask = useCallback(
    async (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => {
      const before = taskRows;
      setTaskRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...changes } : t)));
      setToast({ text: "Saving…" });
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the change");
        setToast({ text: "Saved" });
        setTimeout(() => setToast(null), 1200);
        router.refresh();
      } catch (err) {
        setTaskRows(before);
        setToast({ text: err instanceof Error ? err.message : "Save failed", err: true });
      }
    },
    [taskRows, router]
  );

  const toggleTask = useCallback(
    (task: Task) => {
      const status = task.status === "Done" ? "In Progress" : "Done";
      patchTask(task, { status: status as Task["status"] }, { status });
    },
    [patchTask]
  );

  /**
   * Marking a project delivered opens the feel prompt instead of writing
   * straight away — the answer is only worth having at the moment of
   * delivery, and asked later it is always "fine". Reopening skips it.
   */
  const requestCompletion = useCallback(
    (row: ProjectRow) => {
      if (row.project.status === "Delivered") {
        patch(row.project.id, { status: "Production" }, { status: "Production" });
        return;
      }
      setCompletionFor(row);
    },
    [patch]
  );

  const handlers: TreeHandlers = useMemo(
    () => ({ patch, toggleTask, patchTask, openResources: setResourcesFor, requestCompletion }),
    [patch, toggleTask, patchTask, requestCompletion]
  );

  return (
    <>
      <ProjectsMetricsRow metrics={metrics} currency={currency} />

      {!schemaReady && (
        <div className="card pt-schema-note">
          Some columns are empty because the Projects database is missing the properties they read.{" "}
          <a href="/settings">Run the schema check in Settings</a> and they fill themselves.
        </div>
      )}

      <div className="pt-toolbar">
        <div className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={`tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="pt-filters">
          <input
            className="pt-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, clients, categories…"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="pt-status-filter">
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <NewProjectButton companies={companies} clients={clients} team={team} />
        </div>
      </div>

      {tab === "projects" && (
        <ProjectTree
          sections={sections}
          handlers={handlers}
          clientOptions={clientOptions}
          categoryOptions={categoryOptions}
          teamOptions={teamOptions}
          currency={currency}
        />
      )}

      {tab === "board" && (
        <BoardView
          rows={filtered}
          companies={companies}
          clients={clients}
          team={team}
          taskStats={taskStats}
          todayISO={todayISO}
          onStatus={(p, status) => patch(p.id, { status }, { status })}
        />
      )}

      {tab === "folders" && (
        <div className="grid-2">
          <div className="card section-card">
            <h2>Folders</h2>
            <div className="section-sub">Company → client → project</div>
            <FolderTree
              companies={companies}
              clients={clients}
              projects={filtered}
              clientFor={(p) => clients.find((c) => c.id === p.clientId)?.name ?? ""}
              counts={{ overdue: (p) => Boolean(p.deadline && p.deadline < todayISO && p.status !== "Delivered") }}
              selectedId={treeSelection ?? undefined}
              onSelect={(project) => setTreeSelection(project.id)}
            />
          </div>
          <div className="card section-card">
            <h2>Portfolio read</h2>
            <div className="section-sub">Generated on demand from the live records</div>
            <AiInsights scope="projects" title="Portfolio read" sub="Ranked findings from the live records" />
          </div>
        </div>
      )}

      {toast && <div className={`pt-toast${toast.err ? " err" : ""}`}>{toast.text}</div>}

      {resourcesFor && (
        <ResourcesModal
          projectId={resourcesFor.project.id}
          projectName={resourcesFor.project.name}
          companyName={resourcesFor.company?.name}
          files={resourcesFor.project.files}
          onClose={() => setResourcesFor(null)}
        />
      )}

      {completionFor && (
        <CompletionFeedback
          projectName={completionFor.project.name}
          initialFeel={completionFor.project.completionFeel}
          initialNote={completionFor.project.completionNote}
          onCancel={() => {
            // Skipping still delivers the project — the feel is a bonus, not
            // a gate. Losing the status change because someone closed a modal
            // would be worse than losing the note.
            const row = completionFor;
            setCompletionFor(null);
            patch(row.project.id, { status: "Delivered" }, { status: "Delivered", completedOn: todayISO });
          }}
          onSave={async (feel, note) => {
            const row = completionFor;
            setCompletionFor(null);
            await patch(
              row.project.id,
              { status: "Delivered", completionFeel: feel, completionNote: note, completedOn: todayISO },
              { status: "Delivered", completionFeel: feel, completionNote: note, completedOn: todayISO }
            );
          }}
        />
      )}
    </>
  );
}
