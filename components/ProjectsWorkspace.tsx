"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRecord, Company, Project, Task, TeamMember } from "@/lib/types";
import { NewProjectButton } from "@/components/ProjectForm";
import AiInsights from "@/components/AiInsights";
import FolderTree from "@/components/projects/FolderTree";
import BoardView from "@/components/projects/BoardView";
import ProjectTree, { type TreeHandlers } from "@/components/projects/ProjectTree";
import ProjectsMetricsRow from "@/components/projects/ProjectsMetrics";
import AddPropertyButton from "@/components/projects/AddPropertyButton";
import CompletionFeedback from "@/components/projects/CompletionFeedback";
import ConfirmDelete from "@/components/projects/ConfirmDelete";
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
  schema,
  currency,
  thumbs,
  taskSchema,
}: {
  projects: Project[];
  companies: Company[];
  clients: ClientRecord[];
  team: TeamMember[];
  tasks: Task[];
  payments: import("@/lib/types").Payment[];
  todayISO: string;
  schema: import("@/lib/notion").ProjectSchemaState;
  currency: string;
  /** Locally-stored previews for projects and tasks, keyed by page id. */
  thumbs: Record<string, string>;
  taskSchema: { added: string[]; priorityOptions: string[]; problem?: string };
}) {
  const [rows, setRows] = useState<Project[]>(projects);
  const [taskRows, setTaskRows] = useState<Task[]>(tasks);
  const [tab, setTab] = useState<Tab>("projects");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [resourcesFor, setResourcesFor] = useState<ProjectRow | null>(null);
  const [completionFor, setCompletionFor] = useState<ProjectRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<ProjectRow | null>(null);
  const [treeSelection, setTreeSelection] = useState<string | null>(null);
  const router = useRouter();

  /* ---------- options for the pickers ---------- */
  const clientOptions = useMemo(() => clients.map((c) => c.name).sort(), [clients]);
  const teamOptions = useMemo<PickOption[]>(
    () => team.map((m) => ({ id: m.id, label: m.name, colorSeed: m.id })),
    [team]
  );
  // Categories come from the database's own multi-select options first, then
  // anything already in use, then a small seed list — so a workspace that has
  // curated its tags sees exactly those, and an empty one still gets started.
  const categoryOptions = useMemo<PickOption[]>(() => {
    const seen = new Set<string>(schema.categoryOptions);
    for (const p of rows) for (const c of p.category) seen.add(c);
    if (seen.size === 0) {
      for (const c of ["Hotel", "3D Motion", "SaaS", "Branding", "Web", "Film", "Internal"]) seen.add(c);
    }
    return [...seen].sort().map((c) => ({ id: c, label: c }));
  }, [rows, schema.categoryOptions]);

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

  /** Everything at or below `id`, cycle-safe — the same walk the server does. */
  const branchOf = useCallback(
    (id: string) => {
      const byParent = new Map<string, string[]>();
      for (const t of taskRows) {
        if (!t.parentTaskId) continue;
        byParent.set(t.parentTaskId, [...(byParent.get(t.parentTaskId) ?? []), t.id]);
      }
      const found = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const next = queue.shift()!;
        if (found.has(next)) continue;
        found.add(next);
        queue.push(...(byParent.get(next) ?? []));
      }
      return found;
    },
    [taskRows]
  );

  /**
   * Saves one field on a task.
   *
   * A status change is the interesting case, and the server owns what it means
   * in both directions: down, because a parent's status is derived and cannot
   * be Done above open sub-items; up, because ticking the last sub-item under a
   * milestone completes the milestone, and that may complete the one above it.
   * The response lists exactly what moved, so this tab applies the same result
   * rather than refetching the tree — and the optimistic update below covers
   * the branch too, or the sub-rows would sit visibly stale for a round trip.
   */
  const patchTask = useCallback(
    async (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => {
      const before = taskRows;
      const branch = typeof body.status === "string" ? branchOf(task.id) : new Set([task.id]);
      setTaskRows((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, ...changes }
            : branch.has(t.id)
              ? { ...t, status: body.status as Task["status"] }
              : t
        )
      );
      setToast({ text: branch.size > 1 ? `Updating ${branch.size} items…` : "Saving…" });
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the change");
        const data = await res.json().catch(() => ({}));

        const cascaded: { id: string; status: string; because: string }[] = data?.cascaded || [];
        if (cascaded.length) {
          setTaskRows((prev) =>
            prev.map((t) => {
              const change = cascaded.find((c) => c.id === t.id);
              return change ? { ...t, status: change.status as Task["status"] } : t;
            })
          );
        }

        const nested = (data?.branch?.length ?? branch.size) - 1;
        const top = cascaded[cascaded.length - 1];
        const ancestor = top ? taskRows.find((t) => t.id === top.id) : undefined;
        setToast({
          text: top
            ? top.status === "Done"
              ? `“${ancestor?.title ?? "Parent"}” completed — every sub-item under it is done`
              : `“${ancestor?.title ?? "Parent"}” reopened — it has open work again`
            : nested > 0
              ? `Applied to “${task.title}” and ${nested} nested item${nested === 1 ? "" : "s"}`
              : "Saved",
        });
        setTimeout(() => setToast(null), top || nested > 0 ? 2600 : 1200);
        router.refresh();
      } catch (err) {
        setTaskRows(before);
        setToast({ text: err instanceof Error ? err.message : "Save failed", err: true });
      }
    },
    [taskRows, branchOf, router]
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

  /**
   * A new task at any depth, without leaving the row.
   *
   * `parentTaskId` is the only thing that decides whether this is a milestone,
   * a sub-task or a sub-item — there is no level parameter, because there is
   * no level limit. Priority now has its own Notion property (added by
   * ensureTaskSchema) rather than being smuggled in as a tag.
   */
  const addTask = useCallback(
    async (
      projectId: string,
      input: { title: string; dueDate?: string; startDate?: string; priority?: string; status: string; parentTaskId?: string }
    ) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          projectId,
          status: input.status,
          dueDate: input.dueDate,
          startDate: input.startDate,
          priority: input.priority,
          parentTaskId: input.parentTaskId,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the new task");
      const created = await res.json().catch(() => ({}));
      // Added to local state as well as refreshed: the new row has to appear
      // under the caret that was just used, and a server round trip is a
      // visible pause at the exact moment someone is typing a run of them.
      if (created?.id) {
        setTaskRows((prev) => [
          ...prev,
          {
            id: created.id,
            title: input.title,
            projectId,
            status: input.status as Task["status"],
            dueDate: input.dueDate,
            startDate: input.startDate,
            priority: input.priority,
            parentTaskId: input.parentTaskId,
            assignedTo: [],
            files: [],
          },
        ]);
      }
      setToast({ text: input.parentTaskId ? "Sub-task added" : "Task added" });
      setTimeout(() => setToast(null), 1200);
      router.refresh();
    },
    [router]
  );

  /**
   * Deletes a task and everything nested under it.
   *
   * The whole branch goes because the alternative is orphaned sub-items
   * pointing at a page that no longer exists. The server returns exactly which
   * ids it archived, so local state removes the same set rather than guessing
   * at the shape of the branch a second time.
   */
  const removeTask = useCallback(
    async (task: Task) => {
      const before = taskRows;
      setToast({ text: "Deleting…" });
      try {
        const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the delete");
        const body = await res.json().catch(() => ({}));
        const removed: string[] = body?.removed || [task.id];
        setTaskRows((prev) => prev.filter((t) => !removed.includes(t.id)));
        setToast({
          text:
            removed.length > 1
              ? `Deleted “${task.title}” and ${removed.length - 1} nested item${removed.length === 2 ? "" : "s"}`
              : `Deleted “${task.title}”`,
        });
        setTimeout(() => setToast(null), 2400);
        router.refresh();
      } catch (err) {
        setTaskRows(before);
        setToast({ text: err instanceof Error ? err.message : "Delete failed", err: true });
      }
    },
    [taskRows, router]
  );

  /**
   * Optimistic delete.
   *
   * The row goes immediately and comes back if Notion refuses — the same
   * contract as every other write on this screen. Its tasks go with it in
   * local state too, or the metrics above would keep counting sub-tasks
   * belonging to a project that is no longer on the page.
   */
  const removeProject = useCallback(
    async (row: ProjectRow) => {
      const beforeRows = rows;
      const beforeTasks = taskRows;
      setRows((prev) => prev.filter((p) => p.id !== row.project.id));
      setTaskRows((prev) => prev.filter((t) => t.projectId !== row.project.id));
      setDeleteFor(null);
      setToast({ text: "Deleting…" });
      try {
        const res = await fetch(`/api/projects/${row.project.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Notion refused the delete");
        const body = await res.json().catch(() => ({}));
        setToast({
          text: body.tasksArchived
            ? `Deleted "${row.project.name}" and ${body.tasksArchived} sub-task${body.tasksArchived === 1 ? "" : "s"}`
            : `Deleted "${row.project.name}"`,
        });
        setTimeout(() => setToast(null), 2600);
        router.refresh();
      } catch (err) {
        setRows(beforeRows);
        setTaskRows(beforeTasks);
        setToast({ text: err instanceof Error ? err.message : "Delete failed", err: true });
      }
    },
    [rows, taskRows, router]
  );

  const handlers: TreeHandlers = useMemo(
    () => ({
      patch,
      toggleTask,
      patchTask,
      openResources: setResourcesFor,
      requestCompletion,
      addTask,
      removeTask,
      thumbs,
      requestDelete: setDeleteFor,
    }),
    [patch, toggleTask, patchTask, requestCompletion, addTask, removeTask, thumbs]
  );

  return (
    <>
      <ProjectsMetricsRow metrics={metrics} currency={currency} />

      {schema.added.length > 0 && (
        <div className="card pt-schema-note">
          Added {schema.added.length} {schema.added.length === 1 ? "property" : "properties"} to your Notion Projects
          database so these columns have somewhere to live: {schema.added.join(", ")}.
        </div>
      )}
      {taskSchema.added.length > 0 && (
        <div className="card pt-schema-note">
          Added {taskSchema.added.length} {taskSchema.added.length === 1 ? "property" : "properties"} to your Notion Tasks
          database so tasks can nest and carry previews: {taskSchema.added.join(", ")}.
        </div>
      )}
      {taskSchema.problem && (
        <div className="card pt-schema-note warn">
          Couldn&rsquo;t sync the Tasks schema — {taskSchema.problem} Without a &ldquo;Parent Task&rdquo; relation every
          task shows at the top level, so the breakdown below is flat rather than nested.
        </div>
      )}
      {schema.problem && (
        <div className="card pt-schema-note warn">
          Couldn&rsquo;t sync the Projects schema — {schema.problem} The pickers are showing defaults, which may not match
          your database.
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
            {schema.statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <NewProjectButton companies={companies} clients={clients} team={team} categories={categoryOptions.map((c) => c.label)} />
          {/* On a phone the table header is gone, so the schema builder needs
              a home in the toolbar or it becomes unreachable. */}
          <span className="pt-add-mobile">
            <AddPropertyButton />
          </span>
        </div>
      </div>

      {tab === "projects" && (
        <ProjectTree
          sections={sections}
          handlers={handlers}
          options={{
            clientOptions,
            categoryOptions,
            teamOptions,
            statusOptions: schema.statusOptions,
            priorityOptions: schema.priorityOptions,
            custom: schema.custom,
            currency,
          }}
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
          statuses={schema.statusOptions}
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

      {deleteFor && (
        <ConfirmDelete
          projectName={deleteFor.project.name}
          taskCount={deleteFor.tasks.length}
          fileCount={deleteFor.project.files.length}
          onCancel={() => setDeleteFor(null)}
          onConfirm={() => removeProject(deleteFor)}
        />
      )}

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
