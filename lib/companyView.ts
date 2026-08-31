// One company, everything about it, derived once.
//
// The list page and the profile page each used to compute their own version
// of "active projects" and "revenue this month". Two derivations of the same
// fact is how a card says 2 and the page it links to says 3 — which is
// exactly what a company-management tool cannot afford, because the whole
// point of it is that the number is the number.
//
// So both read this. The same applies to clients, which is why the shape is
// deliberately generic enough for `buildClientView` to sit alongside it.

import { assessHealth, type Health } from "./entityHealth";
import type { ClientRecord, Company, Payment, Project, Task, TeamMember } from "./types";

export interface MoneyRollup {
  /** Received this month, from payments actually marked paid. */
  revenueThisMonth: number;
  /** What has been invoiced, whatever its state. */
  invoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  /** Value sitting on live projects with no invoice raised at all. */
  uninvoiced: number;
}

export interface CompanyView {
  company: Company;
  projects: Project[];
  liveProjects: Project[];
  clients: ClientRecord[];
  team: TeamMember[];
  tasks: Task[];
  payments: Payment[];
  money: MoneyRollup;
  health: Health;
  /** 0-100 against the monthly target, or null when there is no target. */
  targetPct: number | null;
  /** How far through the current month, so a target can be judged fairly. */
  monthPct: number;
  /** Deadlines inside the next seven days, soonest first. */
  upcoming: Project[];
  /** Live projects already past their deadline, worst first. */
  late: Project[];
}

function monthProgress(todayISO: string): number {
  const day = Number(todayISO.slice(8, 10));
  const daysInMonth = new Date(
    Date.UTC(Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)), 0, 12)
  ).getUTCDate();
  return (day / daysInMonth) * 100;
}

function rollupMoney(projects: Project[], payments: Payment[], monthISO: string): MoneyRollup {
  const ids = new Set(projects.map((p) => p.id));
  const mine = payments.filter((p) => p.projectId && ids.has(p.projectId));
  const invoiced = mine.reduce((s, p) => s + (p.amount || 0), 0);
  const paid = mine.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const overdue = mine.filter((p) => p.status === "Overdue").reduce((s, p) => s + (p.amount || 0), 0);
  const revenueThisMonth = mine
    .filter((p) => p.status === "Paid" && (p.paidDate || "").startsWith(monthISO))
    .reduce((s, p) => s + (p.amount || 0), 0);
  const uninvoiced = projects
    .filter((p) => p.status !== "Delivered" && (p.value || 0) > 0 && !mine.some((m) => m.projectId === p.id))
    .reduce((s, p) => s + (p.value || 0), 0);
  return { revenueThisMonth, invoiced, paid, outstanding: invoiced - paid, overdue, uninvoiced };
}

export function buildCompanyView(input: {
  company: Company;
  projects: Project[];
  clients: ClientRecord[];
  team: TeamMember[];
  tasks: Task[];
  payments: Payment[];
  todayISO: string;
  money: (n: number) => string;
}): CompanyView {
  const { company, todayISO } = input;
  const projects = input.projects.filter((p) => p.companyId === company.id);
  const clients = input.clients.filter((c) => c.companyId === company.id);
  const projectIds = new Set(projects.map((p) => p.id));
  const payments = input.payments.filter((p) => p.projectId && projectIds.has(p.projectId));
  const tasks = input.tasks.filter((t) => projectIds.has(t.projectId));
  // Team membership is read off the projects rather than a company field:
  // whoever is assigned to this company's work is on this company's team, and
  // that cannot drift out of date the way a separate list would.
  const memberIds = new Set(projects.flatMap((p) => p.assignedTo));
  const team = input.team.filter((m) => memberIds.has(m.id));

  const liveProjects = projects.filter((p) => p.status !== "Delivered");
  const money = rollupMoney(projects, payments, todayISO.slice(0, 7));
  const target = company.monthlyRevenueTarget;

  const late = liveProjects
    .filter((p) => p.deadline && p.deadline < todayISO)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
  const upcoming = liveProjects
    .filter((p) => p.deadline && p.deadline >= todayISO)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
    .filter((p) => {
      const days = Math.round(
        (new Date(`${p.deadline!}T00:00:00Z`).getTime() - new Date(`${todayISO}T00:00:00Z`).getTime()) / 86400000
      );
      return days <= 7;
    });

  return {
    company,
    projects,
    liveProjects,
    clients,
    team,
    tasks,
    payments,
    money,
    targetPct: target && target > 0 ? (money.revenueThisMonth / target) * 100 : null,
    monthPct: monthProgress(todayISO),
    upcoming,
    late,
    health: assessHealth({
      projects,
      payments,
      todayISO,
      monthlyTarget: target,
      revenueThisMonth: money.revenueThisMonth,
      money: input.money,
      hrefs: { projects: `/companies/${company.id}`, payments: "/payments" },
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export interface ClientView {
  client: ClientRecord;
  company?: Company;
  projects: Project[];
  liveProjects: Project[];
  payments: Payment[];
  money: MoneyRollup;
  health: Health;
  upcoming: Project[];
  late: Project[];
  /** The most recent thing that happened, for "is this relationship warm". */
  lastActivity?: { label: string; date: string };
}

export function buildClientView(input: {
  client: ClientRecord;
  companies: Company[];
  projects: Project[];
  payments: Payment[];
  todayISO: string;
  money: (n: number) => string;
}): ClientView {
  const { client, todayISO } = input;
  const projects = input.projects.filter((p) => p.clientId === client.id);
  const projectIds = new Set(projects.map((p) => p.id));
  const payments = input.payments.filter(
    (p) => p.clientId === client.id || (p.projectId && projectIds.has(p.projectId))
  );
  const liveProjects = projects.filter((p) => p.status !== "Delivered");
  const money = rollupMoney(projects, payments, todayISO.slice(0, 7));

  const late = liveProjects
    .filter((p) => p.deadline && p.deadline < todayISO)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
  const upcoming = liveProjects
    .filter((p) => p.deadline && p.deadline >= todayISO)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));

  // The freshest thing that has actually HAPPENED on the relationship. A
  // client with nothing for four months is a fact worth surfacing, and it is
  // not derivable from a status field somebody set once.
  //
  // Future dates are excluded. An invoice due next month is not activity — it
  // is a plan — and including it made the panel report "Last activity
  // upcoming" about a client nobody had spoken to in weeks, which is the
  // opposite of what the line is for.
  const events: { label: string; date: string }[] = [
    ...payments.filter((p) => p.paidDate).map((p) => ({ label: `Paid ${p.label || "an invoice"}`, date: p.paidDate! })),
    ...payments.filter((p) => p.dueDate && !p.paidDate).map((p) => ({ label: `${p.status}: ${p.label || "invoice"}`, date: p.dueDate! })),
    ...projects.filter((p) => p.startDate).map((p) => ({ label: `Started ${p.name}`, date: p.startDate! })),
  ]
    .filter((e) => e.date.slice(0, 10) <= todayISO)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    client,
    company: input.companies.find((c) => c.id === client.companyId),
    projects,
    liveProjects,
    payments,
    money,
    upcoming,
    late,
    lastActivity: events[0],
    health: assessHealth({
      projects,
      payments,
      todayISO,
      money: input.money,
      hrefs: { projects: "/projects", payments: "/payments" },
    }),
  };
}
