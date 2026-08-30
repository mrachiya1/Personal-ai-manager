// Everything the Projects screen counts, grouped in one place.
//
// The screen shows six headline numbers and then contradicts none of them in
// the table below, which only holds if both read from the same functions.
// Every figure here is derived from a record; nothing is estimated.

import type { ClientRecord, Company, Payment, Project, Task, TeamMember } from "./types";
import { sortProjects } from "./projectOrder";
import { buildTaskTree, type TaskTree } from "./taskTree";

/* ================================================================== */
/* Per-project derived fields                                          */
/* ================================================================== */

export type PaymentState = "Paid" | "Half done" | "Pending" | "Overdue" | "Not invoiced";

export interface ProjectRow {
  project: Project;
  client?: ClientRecord;
  company?: Company;
  assignees: TeamMember[];
  tasks: Task[];
  /** The nested view of `tasks`, at whatever depth the data runs to. */
  tree: TaskTree;
  /**
   * 0-100, counted over the deepest sub-items rather than the top level.
   *
   * A milestone with four sub-items of which none are done contributes 0/4,
   * not 0/1 — so a project broken down two levels deep reports what is
   * actually finished instead of what has been ticked at the top. Null when
   * the project has no tasks yet.
   */
  progress: number | null;
  doneCount: number;
  taskCount: number;
  /** The task actually in flight, or the next one due. */
  nextTask?: Task;
  payment: { state: PaymentState; invoiced: number; paid: number };
  /** Days until the deadline; negative is overdue. Null with no deadline. */
  daysLeft: number | null;
  urgency: "late" | "soon" | null;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(`${toISO}T00:00:00Z`).getTime() - new Date(`${fromISO}T00:00:00Z`).getTime()) / 86400000
  );
}

/**
 * How much of a project's money has landed.
 *
 * Read off Payments rather than stored on the project, so it cannot drift
 * from the ledger. A project with a value but no invoice raised is "not
 * invoiced", which is a different problem from "pending" and worth seeing as
 * one — it usually means someone forgot to bill.
 */
function paymentState(project: Project, payments: Payment[]) {
  const mine = payments.filter((p) => p.projectId === project.id);
  const invoiced = mine.reduce((s, p) => s + (p.amount || 0), 0);
  const paid = mine.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);

  let state: PaymentState;
  if (mine.length === 0) state = "Not invoiced";
  else if (mine.some((p) => p.status === "Overdue")) state = "Overdue";
  else if (paid >= invoiced && invoiced > 0) state = "Paid";
  else if (paid > 0) state = "Half done";
  else state = "Pending";

  return { state, invoiced, paid };
}

export function buildRows(input: {
  projects: Project[];
  clients: ClientRecord[];
  companies: Company[];
  team: TeamMember[];
  tasks: Task[];
  payments: Payment[];
  todayISO: string;
}): ProjectRow[] {
  const clientById = new Map(input.clients.map((c) => [c.id, c]));
  const companyById = new Map(input.companies.map((c) => [c.id, c]));
  const memberById = new Map(input.team.map((m) => [m.id, m]));

  // The hand-arranged order, applied once here so every downstream view —
  // the table, the board, the folders — shows the same sequence. Sorting in
  // each view instead is how two of them end up disagreeing about where a
  // project sits.
  return sortProjects(input.projects).map((project) => {
    const tasks = input.tasks.filter((t) => t.projectId === project.id);
    const tree = buildTaskTree(tasks);

    // In Progress first, then the soonest due, then anything left. A project
    // whose "next task" is whatever happens to sort first is not telling you
    // anything.
    const open = tasks.filter((t) => t.status !== "Done");
    const nextTask =
      open.find((t) => t.status === "In Progress") ??
      [...open].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0];

    const daysLeft = project.deadline ? daysBetween(input.todayISO, project.deadline) : null;

    return {
      project,
      client: project.clientId ? clientById.get(project.clientId) : undefined,
      company: companyById.get(project.companyId),
      assignees: project.assignedTo.map((id) => memberById.get(id)).filter(Boolean) as TeamMember[],
      tasks,
      tree,
      progress: tree.progress,
      doneCount: tree.doneLeafCount,
      taskCount: tree.leafCount,
      nextTask,
      payment: paymentState(project, input.payments),
      daysLeft,
      urgency:
        project.status === "Delivered" || daysLeft === null
          ? null
          : daysLeft < 0
            ? "late"
            : daysLeft <= 7
              ? "soon"
              : null,
    };
  });
}

/* ================================================================== */
/* Sections                                                           */
/* ================================================================== */

export interface ProjectSection {
  /** Small line above the title — "Client project" over "Company Orextic". */
  eyebrow?: string;
  key: string;
  title: string;
  subtitle: string;
  kind: "client" | "personal";
  colorVar?: string;
  rows: ProjectRow[];
}

/**
 * Work filed under a company, split by company; then everything else.
 *
 * THE COMPANY is the dividing line, not the client. It used to be the client,
 * on the reasoning that a project with no client has no invoice and no
 * payment status — true, and irrelevant to where the project belongs. An
 * operator running their own studios does a great deal of company work with
 * no external client at all: a showreel, a site rebuild, a pitch. Filing all
 * of it as "Personal project · internal R&D" put every one of this
 * workspace's projects in the one section it did not belong in, and made the
 * company selector on the form look broken, because setting it changed
 * nothing on screen.
 *
 * Personal now means what it says: no company AND no client. Self-directed.
 */
export function sectionise(rows: ProjectRow[], companies: Company[]): ProjectSection[] {
  const filed = rows.filter((r) => r.project.companyId || r.client);
  const personal = rows.filter((r) => !r.project.companyId && !r.client);

  const sections: ProjectSection[] = companies
    .map((company) => {
      const mine = filed.filter((r) => r.project.companyId === company.id);
      const clientCount = new Set(mine.filter((r) => r.client).map((r) => r.client!.id)).size;
      const internal = mine.filter((r) => !r.client).length;
      // The subtitle describes what is actually in the section rather than
      // assuming every company project is billable. "3 projects · 2 clients ·
      // 1 internal" is the truth for a studio that ships its own work too.
      const parts = [`${mine.length} ${mine.length === 1 ? "project" : "projects"}`];
      if (clientCount) parts.push(`${clientCount} ${clientCount === 1 ? "client" : "clients"}`);
      if (internal) parts.push(`${internal} internal`);
      return {
        key: `company:${company.id}`,
        // Two lines rather than one prefixed string: the kind of work is the
        // eyebrow and the company is the title, so a run of company sections
        // reads as a list of companies instead of a list of sentences that all
        // start with the same two words.
        eyebrow: clientCount ? "Client project" : "Company project",
        title: `Company ${company.name}`,
        subtitle: parts.join(" · "),
        kind: "client" as const,
        colorVar: company.colorVar,
        rows: mine,
      };
    })
    .filter((s) => s.rows.length > 0);

  // Client work whose company was deleted or never set still has to appear
  // somewhere, or the section counts won't add up to the headline count.
  const orphans = filed.filter((r) => !companies.some((c) => c.id === r.project.companyId));
  if (orphans.length) {
    sections.push({
      key: "company:none",
      eyebrow: "Client project",
      title: "No company set",
      subtitle: `${orphans.length} client ${orphans.length === 1 ? "project" : "projects"} not filed under a company`,
      kind: "client",
      rows: orphans,
    });
  }

  if (personal.length) {
    sections.push({
      key: "personal",
      title: "Personal project",
      subtitle: `${personal.length} self-directed ${personal.length === 1 ? "project" : "projects"} · no company, no client`,
      kind: "personal",
      rows: personal,
    });
  }

  return sections;
}

/* ================================================================== */
/* The six headline metrics                                            */
/* ================================================================== */

export interface EntitySlice {
  key: string;
  label: string;
  value: number;
}

export interface ProjectsMetrics {
  /** Card 1 — distribution by entity, for the donut. */
  distribution: EntitySlice[];
  distributionTotal: number;
  /** Card 2 — value of everything still live. */
  ongoingValue: number;
  ongoingValueSplit: EntitySlice[];
  /** Card 3 — how many projects exist at all. */
  total: number;
  totalSplit: EntitySlice[];
  /** Card 4 — live and due inside seven days, plus what has already slipped. */
  nearDeadlines: number;
  overdue: number;
  nearSplit: EntitySlice[];
  /** Card 5 — accepted but not started. */
  upcoming: number;
  upcomingSplit: EntitySlice[];
  /** Card 6 — due to land this calendar month, and how many already have. */
  monthlyDue: number;
  monthlyDelivered: number;
}

const PERSONAL_KEY = "personal";

/**
 * Which entity a project's value belongs to, for the donut and the splits.
 *
 * The company first, exactly as sectionise() files it. Keying off the client
 * instead put every internal company project into "Personal R&D", which is
 * how a workspace with three studios and five company projects showed a donut
 * reading "Personal R&D 5 · 100%".
 */
function entityOf(row: ProjectRow): { key: string; label: string } {
  if (row.company) return { key: row.company.id, label: row.company.name };
  if (row.client) return { key: "unfiled", label: "No company" };
  return { key: PERSONAL_KEY, label: "Personal R&D" };
}

function splitBy(rows: ProjectRow[], measure: (r: ProjectRow) => number): EntitySlice[] {
  const acc = new Map<string, EntitySlice>();
  for (const row of rows) {
    const { key, label } = entityOf(row);
    const value = measure(row);
    if (!value) continue;
    const slice = acc.get(key) ?? { key, label, value: 0 };
    slice.value += value;
    acc.set(key, slice);
  }
  // Personal work sorts last so the client entities keep a stable colour
  // order as projects come and go — colour has to follow the entity, never
  // its rank, or a filter would repaint the survivors.
  return [...acc.values()].sort((a, b) =>
    a.key === PERSONAL_KEY ? 1 : b.key === PERSONAL_KEY ? -1 : b.value - a.value
  );
}

export function computeMetrics(rows: ProjectRow[], todayISO: string): ProjectsMetrics {
  const live = rows.filter((r) => r.project.status !== "Delivered");
  const month = todayISO.slice(0, 7);

  const nearRows = live.filter((r) => r.daysLeft !== null && r.daysLeft <= 7);
  const upcomingRows = live.filter((r) => r.project.status === "Idea" || r.project.status === "Planning");

  return {
    distribution: splitBy(rows, () => 1),
    distributionTotal: rows.length,

    ongoingValue: live.reduce((s, r) => s + (r.project.value || 0), 0),
    ongoingValueSplit: splitBy(live, (r) => r.project.value || 0),

    total: rows.length,
    totalSplit: splitBy(rows, () => 1),

    nearDeadlines: nearRows.length,
    overdue: nearRows.filter((r) => (r.daysLeft ?? 0) < 0).length,
    nearSplit: splitBy(nearRows, () => 1),

    upcoming: upcomingRows.length,
    upcomingSplit: splitBy(upcomingRows, () => 1),

    monthlyDue: rows.filter((r) => r.project.deadline?.slice(0, 7) === month).length,
    monthlyDelivered: rows.filter(
      (r) => r.project.status === "Delivered" && (r.project.completedOn ?? r.project.deadline)?.slice(0, 7) === month
    ).length,
  };
}
