// Everything the Projects screen counts, grouped in one place.
//
// The screen shows six headline numbers and then contradicts none of them in
// the table below, which only holds if both read from the same functions.
// Every figure here is derived from a record; nothing is estimated.

import type { ClientRecord, Company, Payment, Project, Task, TeamMember } from "./types";

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
  /** 0-100, from resolved sub-tasks. Null when the project has no tasks yet. */
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

  return input.projects.map((project) => {
    const tasks = input.tasks.filter((t) => t.projectId === project.id);
    const doneCount = tasks.filter((t) => t.status === "Done").length;

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
      progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : null,
      doneCount,
      taskCount: tasks.length,
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
  key: string;
  title: string;
  subtitle: string;
  kind: "client" | "personal";
  colorVar?: string;
  rows: ProjectRow[];
}

/**
 * Client work, split by company; then everything self-directed.
 *
 * The dividing line is whether a client is attached, not a flag someone has
 * to remember to set. That is the same line the billing fields fall on — a
 * project with no client has no invoice, no payment status and no account to
 * keep warm — so the table can simply hide those columns for the personal
 * section rather than showing a row of dashes.
 */
export function sectionise(rows: ProjectRow[], companies: Company[]): ProjectSection[] {
  const client = rows.filter((r) => r.client);
  const personal = rows.filter((r) => !r.client);

  const sections: ProjectSection[] = companies
    .map((company) => {
      const mine = client.filter((r) => r.project.companyId === company.id);
      return {
        key: `company:${company.id}`,
        title: company.name,
        subtitle: `${mine.length} client ${mine.length === 1 ? "project" : "projects"} · ${
          new Set(mine.map((r) => r.client!.id)).size
        } ${new Set(mine.map((r) => r.client!.id)).size === 1 ? "client" : "clients"}`,
        kind: "client" as const,
        colorVar: company.colorVar,
        rows: mine,
      };
    })
    .filter((s) => s.rows.length > 0);

  // Client work whose company was deleted or never set still has to appear
  // somewhere, or the section counts won't add up to the headline count.
  const orphans = client.filter((r) => !companies.some((c) => c.id === r.project.companyId));
  if (orphans.length) {
    sections.push({
      key: "company:none",
      title: "No company set",
      subtitle: `${orphans.length} client ${orphans.length === 1 ? "project" : "projects"} not filed under a company`,
      kind: "client",
      rows: orphans,
    });
  }

  if (personal.length) {
    sections.push({
      key: "personal",
      title: "Personal & internal R&D",
      subtitle: `${personal.length} self-directed ${personal.length === 1 ? "project" : "projects"} · no client, no invoice`,
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

function entityOf(row: ProjectRow): { key: string; label: string } {
  if (!row.client) return { key: PERSONAL_KEY, label: "Personal & R&D" };
  return row.company
    ? { key: row.company.id, label: row.company.name }
    : { key: "unfiled", label: "No company" };
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
