// Everything the Today dashboard needs, assembled in one place.
//
// The page itself stays a layout file: each number below is computed here,
// where the rule behind it can be read and argued with, rather than inline
// in JSX where a wrong denominator hides in plain sight.

import type { ClientRecord, Company, Income, Payment, Project, Task } from "./types";
import type { CalendarEvent } from "./googleCalendar";
import type { PanchangWindows } from "./panchang";

export interface RevenuePulse {
  /** Money actually received this month. */
  collected: number;
  /** Collected plus what is already invoiced and still due this month. */
  predicted: number;
  /** Sum of every company's monthly revenue target, when they are set. */
  target: number;
  /** Invoiced, unpaid, due this month or already overdue. */
  outstanding: number;
  overdue: number;
  currency: string;
  /** How far through the month we are, 0-1 — the pace line on the bar. */
  monthElapsed: number;
}

export interface ExecutionLoad {
  dueToday: Task[];
  shippingToday: Project[];
  /** Not due today, but inside the next seven days. */
  thisWeek: Project[];
  /** Past deadline and not delivered. */
  slipped: Project[];
}

export interface CashFlow {
  /** Invoiced and expected inside the next fortnight, grouped by currency. */
  inbound: { currency: string; amount: number; count: number }[];
  nextIn: { label: string; client?: string; amount: number; currency: string; dueDate?: string; overdue: boolean } | null;
  meetings: MeetingSlot[];
}

export interface MeetingSlot {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees: number;
  /** Set when the meeting overlaps an inauspicious window. */
  clash: string | null;
}

function monthOf(iso?: string): string {
  return iso ? iso.slice(0, 7) : "";
}

export function revenuePulse(input: {
  payments: Payment[];
  income: Income[];
  companies: Company[];
  todayISO: string;
}): RevenuePulse {
  const month = monthOf(input.todayISO);

  // Income is the record of money that actually landed. Payments marked paid
  // auto-create a linked income entry (see markPaymentPaid), so counting both
  // would double every settled invoice — income alone is the honest figure.
  const collected = input.income
    .filter((i) => monthOf(i.date) === month)
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const open = input.payments.filter((p) => p.status !== "Paid");
  const outstanding = open
    .filter((p) => !p.dueDate || monthOf(p.dueDate) <= month)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdue = open.filter((p) => p.status === "Overdue").reduce((sum, p) => sum + (p.amount || 0), 0);

  const target = input.companies.reduce((sum, c) => sum + (c.monthlyRevenueTarget || 0), 0);

  const day = Number(input.todayISO.slice(8, 10));
  const daysInMonth = new Date(Number(input.todayISO.slice(0, 4)), Number(input.todayISO.slice(5, 7)), 0).getDate();

  return {
    collected,
    predicted: collected + outstanding,
    target,
    outstanding,
    overdue,
    currency: input.payments.find((p) => p.currency)?.currency || "USD",
    monthElapsed: day / daysInMonth,
  };
}

export function executionLoad(input: { projects: Project[]; tasks: Task[]; todayISO: string }): ExecutionLoad {
  const weekOut = new Date(`${input.todayISO}T00:00:00Z`);
  weekOut.setUTCDate(weekOut.getUTCDate() + 7);
  const weekOutISO = weekOut.toISOString().slice(0, 10);

  const live = input.projects.filter((p) => p.status !== "Delivered");

  return {
    dueToday: input.tasks.filter((t) => t.dueDate === input.todayISO && t.status !== "Done"),
    shippingToday: live.filter((p) => p.deadline === input.todayISO),
    thisWeek: live.filter((p) => p.deadline && p.deadline > input.todayISO && p.deadline <= weekOutISO),
    slipped: live.filter((p) => p.deadline && p.deadline < input.todayISO),
  };
}

/** Minutes of overlap between two intervals. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const s = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const e = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return e > s;
}

export function cashFlow(input: {
  payments: Payment[];
  clients: ClientRecord[];
  events: CalendarEvent[];
  panchang: PanchangWindows | null;
  todayISO: string;
}): CashFlow {
  const horizon = new Date(`${input.todayISO}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const horizonISO = horizon.toISOString().slice(0, 10);

  const expected = input.payments.filter(
    (p) => p.status !== "Paid" && (!p.dueDate || p.dueDate <= horizonISO)
  );

  const byCurrency = new Map<string, { currency: string; amount: number; count: number }>();
  for (const p of expected) {
    const currency = p.currency || "USD";
    const row = byCurrency.get(currency) || { currency, amount: 0, count: 0 };
    row.amount += p.amount || 0;
    row.count += 1;
    byCurrency.set(currency, row);
  }

  // Soonest first, but an invoice with no due date shouldn't jump the queue.
  const sorted = [...expected].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const next = sorted[0];

  const meetings: MeetingSlot[] = input.events.map((e) => {
    let clash: string | null = null;
    if (!e.allDay && input.panchang) {
      const windows: [string, { start: string; end: string }][] = [
        ["Rahu Kalam", input.panchang.rahuKalam],
        ["Yamagandam", input.panchang.yamagandam],
        ["Gulika Kalam", input.panchang.gulikaKalam],
      ];
      for (const [name, w] of windows) {
        if (overlaps(e.start, e.end, w.start, w.end)) {
          clash = name;
          break;
        }
      }
    }
    return {
      id: e.id,
      summary: e.summary,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      attendees: e.attendees,
      clash,
    };
  });

  return {
    inbound: [...byCurrency.values()].sort((a, b) => b.amount - a.amount),
    nextIn: next
      ? {
          label: next.label,
          client: input.clients.find((c) => c.id === next.clientId)?.name,
          amount: next.amount,
          currency: next.currency || "USD",
          dueDate: next.dueDate,
          // Sorting by due date puts the oldest unpaid invoice first, which is
          // usually one that is already late — calling that "next in" without
          // saying so would read as money on the way.
          overdue: Boolean(next.dueDate && next.dueDate < input.todayISO) || next.status === "Overdue",
        }
      : null,
    meetings,
  };
}

/**
 * One line saying what shipping this project actually buys — drawn from the
 * record, never invented. A task with a number and a client attached is one
 * you can prioritise; "finish the UI module" on its own is not.
 */
export function visionLine(
  project: Project,
  clients: ClientRecord[],
  companies: Company[],
  currency = "USD"
): string {
  const parts: string[] = [];
  const client = clients.find((c) => c.id === project.clientId);
  const company = companies.find((c) => c.id === project.companyId);

  if (project.value) {
    parts.push(`${currency === "LKR" ? "Rs " : "$"}${project.value.toLocaleString()} booked`);
  }
  if (client) {
    parts.push(client.relationship === "VIP" ? `holds the ${client.name} account` : `keeps ${client.name} moving`);
  }
  if (company) parts.push(`builds ${company.name}`);
  if (project.headline) parts.unshift(project.headline);

  return parts.length ? parts.join(" · ") : "No client or value attached yet — worth filing before it starts.";
}

/* ================================================================== */
/* Company-split metrics                                               */
/* ================================================================== */

export interface CompanySplit {
  companyId: string;
  name: string;
  /** The number shown on the badge — money, or a count, depending on the card. */
  value: number;
}

/**
 * Which company a payment belongs to.
 *
 * Payments carry a client and a project, not a company, so the company has to
 * be walked to: the project knows its company, and failing that the client
 * does. Anything that can't be traced is left out of the badges rather than
 * dumped into the first company, which would quietly overstate it.
 */
function companyOfPayment(
  payment: Payment,
  projects: Project[],
  clients: ClientRecord[]
): string | undefined {
  const project = payment.projectId ? projects.find((p) => p.id === payment.projectId) : undefined;
  if (project?.companyId) return project.companyId;
  return clients.find((c) => c.id === payment.clientId)?.companyId;
}

function splitsFrom(
  companies: Company[],
  rows: { companyId?: string; value: number }[]
): CompanySplit[] {
  const byCompany = new Map<string, number>();
  for (const row of rows) {
    if (!row.companyId) continue;
    byCompany.set(row.companyId, (byCompany.get(row.companyId) || 0) + row.value);
  }
  return companies
    .map((c) => ({ companyId: c.id, name: c.name, value: byCompany.get(c.id) || 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}

export interface MetricCard {
  key: string;
  label: string;
  /** Pre-formatted, because a count and an amount format differently. */
  display: string;
  splits: CompanySplit[];
  /** How to render the company badges — three projects and three thousand
   *  dollars must not look the same. */
  splitFormat: "money" | "count";
  splitCurrency?: string;
  foot?: string;
  tone?: "good" | "warn" | "critical";
}

export function metricCards(input: {
  companies: Company[];
  projects: Project[];
  clients: ClientRecord[];
  tasks: Task[];
  payments: Payment[];
  income: Income[];
  todayISO: string;
  capacity: DeepWorkCapacity;
  money: (n: number, currency?: string) => string;
}): MetricCard[] {
  const { companies, projects, clients, tasks, payments, income, todayISO, money } = input;
  const month = todayISO.slice(0, 7);

  /* --- 1 & 2: income ---------------------------------------------------- */
  // Realised: income entries dated this month. Payments marked paid create a
  // linked income entry, so counting both would double every settled invoice.
  const realisedRows = income.filter((i) => i.date?.slice(0, 7) === month);
  const realised = realisedRows.reduce((s, i) => s + (i.amount || 0), 0);

  // Predictable: realised plus what is invoiced and still expected this month.
  const openThisMonth = payments.filter(
    (p) => p.status !== "Paid" && (!p.dueDate || p.dueDate.slice(0, 7) <= month)
  );
  const expected = openThisMonth.reduce((s, p) => s + (p.amount || 0), 0);
  const currency = realisedRows[0]?.currency || payments[0]?.currency || "USD";

  /* --- 3: projects with work this month ---------------------------------- */
  const live = projects.filter((p) => p.status !== "Delivered");
  const thisMonthProjects = live.filter(
    (p) => !p.deadline || p.deadline.slice(0, 7) <= month || p.startDate?.slice(0, 7) === month
  );

  /* --- 4: what must ship today ------------------------------------------- */
  const dueToday = tasks.filter((t) => t.dueDate === todayISO && t.status !== "Done");
  const shippingToday = live.filter((p) => p.deadline === todayISO);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  /* --- 5: receivables ----------------------------------------------------- */
  const overdueCount = openThisMonth.filter((p) => p.status === "Overdue").length;

  return [
    {
      key: "predictable",
      splitFormat: "money" as const,
      splitCurrency: currency,
      label: "This month predictable income",
      display: `${money(realised + expected, currency)}${expected > 0 ? " +" : ""}`,
      splits: splitsFrom(
        companies,
        [
          ...realisedRows.map((i) => ({ companyId: i.companyId, value: i.amount || 0 })),
          ...openThisMonth.map((p) => ({
            companyId: companyOfPayment(p, projects, clients),
            value: p.amount || 0,
          })),
        ]
      ),
      foot:
        expected > 0
          ? `${money(expected, currency)} of it still to collect`
          : "Everything invoiced this month has landed",
    },
    {
      key: "current",
      splitFormat: "money" as const,
      splitCurrency: currency,
      label: "This month current income",
      display: money(realised, currency),
      splits: splitsFrom(companies, realisedRows.map((i) => ({ companyId: i.companyId, value: i.amount || 0 }))),
      foot: realised > 0 ? `${realisedRows.length} entries booked` : "Nothing booked yet this month",
    },
    {
      key: "projects",
      splitFormat: "count" as const,
      label: "Available projects this month",
      display: String(thisMonthProjects.length).padStart(2, "0"),
      splits: splitsFrom(companies, thisMonthProjects.map((p) => ({ companyId: p.companyId, value: 1 }))),
      foot: `${live.length} live in total`,
    },
    {
      key: "tasks",
      splitFormat: "count" as const,
      label: "Today you complete",
      display: String(dueToday.length + shippingToday.length).padStart(2, "0"),
      splits: splitsFrom(companies, [
        ...dueToday.map((t) => ({ companyId: projectById.get(t.projectId)?.companyId, value: 1 })),
        ...shippingToday.map((p) => ({ companyId: p.companyId, value: 1 })),
      ]),
      foot:
        dueToday.length + shippingToday.length === 0
          ? "Clear runway — build ahead"
          : `${dueToday.length} ${dueToday.length === 1 ? "task" : "tasks"}, ${shippingToday.length} project ${shippingToday.length === 1 ? "deadline" : "deadlines"}`,
    },
    {
      key: "payments",
      splitFormat: "money" as const,
      splitCurrency: currency,
      label: "Upcoming payments",
      display: money(expected, currency),
      splits: splitsFrom(
        companies,
        openThisMonth.map((p) => ({ companyId: companyOfPayment(p, projects, clients), value: p.amount || 0 }))
      ),
      tone: overdueCount > 0 ? "critical" : undefined,
      foot:
        overdueCount > 0
          ? `${overdueCount} already overdue — chase these first`
          : `${openThisMonth.length} invoices outstanding`,
    },
    {
      key: "capacity",
      splitFormat: "count" as const,
      label: "Today deep work capacity",
      display: input.capacity.label,
      splits: [],
      tone: input.capacity.tone,
      foot: input.capacity.reason,
    },
  ];
}

/* ================================================================== */
/* Deep-work capacity                                                  */
/* ================================================================== */

export interface DeepWorkCapacity {
  hours: number;
  label: string;
  reason: string;
  tone: "good" | "warn" | "critical";
}

/**
 * How many hours of real focus today can carry.
 *
 * Two independent ceilings, and the lower one wins: the sky's (how many
 * favourable, unblocked daylight hours remain) and the body's (what last
 * night's sleep will actually sustain). Reporting the astrological figure
 * alone would promise twelve hours of deep work on five hours of sleep, which
 * is exactly the kind of advice that produces the rework loop.
 */
export function deepWorkCapacity(input: {
  horaHours: number;
  sleepHours?: number;
  energyLevel?: string;
}): DeepWorkCapacity {
  const { horaHours, sleepHours, energyLevel } = input;

  // Sleep research is consistent enough to be blunt about: under six hours,
  // sustained focus collapses; seven to nine sustains a full working day.
  let bodyCeiling = 8;
  if (sleepHours !== undefined) {
    if (sleepHours >= 7) bodyCeiling = 12;
    else if (sleepHours >= 6) bodyCeiling = 9;
    else if (sleepHours >= 5) bodyCeiling = 6;
    else bodyCeiling = 4;
  }
  if (energyLevel === "Low") bodyCeiling = Math.min(bodyCeiling, 5);
  if (energyLevel === "High") bodyCeiling += 1;

  const hours = Math.max(1, Math.min(horaHours, bodyCeiling));
  const limitedBy = horaHours <= bodyCeiling ? "sky" : "body";

  const sleepNote =
    sleepHours === undefined
      ? "No sleep logged last night — log one and this gets sharper"
      : sleepHours >= 7
        ? `${sleepHours.toFixed(1)}h sleep — a full day is sustainable`
        : sleepHours >= 6
          ? `${sleepHours.toFixed(1)}h sleep — good, not deep`
          : `${sleepHours.toFixed(1)}h sleep — this is the ceiling, not the horas`;

  const skyNote =
    horaHours < 0.25
      ? "today's daylight is spent — the next window opens at sunrise"
      : limitedBy === "sky"
        ? `${horaHours.toFixed(1)}h of favourable, unblocked daylight left`
        : "the sky offers more, your rest doesn't";

  return {
    hours,
    label: `${hours >= 10 ? `${Math.floor(hours)}h+` : `${hours.toFixed(hours % 1 ? 1 : 0)}h`}`,
    reason: `${sleepNote} · ${skyNote}`,
    tone: hours >= 8 ? "good" : hours >= 5 ? "warn" : "critical",
  };
}

/* ================================================================== */
/* Time-blocked schedule                                               */
/* ================================================================== */

export interface ScheduledBlock {
  id: string;
  title: string;
  /** ISO instants, so the client formats them in the user's own timezone. */
  start: string;
  end: string;
  done: boolean;
  /** What shipping this buys, from the project record. */
  vision: string;
  projectName?: string;
  milestone: "today" | "late" | null;
  /** The hora the block sits in, so the allocation is explicable. */
  planet?: string;
}

/**
 * Lays today's work onto the clock.
 *
 * Tasks in Notion carry a due date, not a time — so rather than inventing
 * arbitrary slots, each one is dropped into the next favourable, unblocked
 * hora. The schedule is then defensible: every block can say which planetary
 * hour it sits in and why that hour was free.
 */
export interface DaySchedule {
  blocks: ScheduledBlock[];
  /** False once the day's favourable windows have all passed. */
  live: boolean;
}

export function scheduleToday(input: {
  tasks: { id: string; title: string; projectId: string; status: string }[];
  projects: Project[];
  clients: ClientRecord[];
  companies: Company[];
  currency: string;
  /** Candidate windows, already filtered to daylight and sorted. */
  windows: { start: string; end: string; planet: string; focus: number }[];
  todayISO: string;
  now: Date;
}): DaySchedule {
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const nowMs = input.now.getTime();

  // Windows that haven't already passed — a plan for 8am at 3pm in the
  // afternoon is noise.
  const sorted = [...input.windows].sort((a, b) => a.start.localeCompare(b.start));
  const remaining = sorted.filter((w) => new Date(w.end).getTime() > nowMs);
  // After sunset there is no daylight left to allocate into, and an empty
  // panel at 11pm reads as "nothing is due" rather than "the day is over".
  // Fall back to the day's full shape so the work is still visible; the
  // caller is told, so the panel can say which of the two it is showing.
  const open = remaining.length ? remaining : sorted;

  const live = remaining.length > 0;
  const blocks: ScheduledBlock[] = [];
  let cursor = 0;
  let offsetMs = 0;

  for (const task of input.tasks) {
    const project = projectById.get(task.projectId);

    // Walk forward until a window has room. The earlier version advanced the
    // cursor and moved to the next *task*, which silently dropped a task
    // whenever its window happened to be full.
    let slot: { start: number; end: number; planet: string } | null = null;
    while (cursor < open.length) {
      const window = open[cursor];
      // Clamp to now only while there is still day left to plan. In the
      // after-sunset fallback every window is behind us, and clamping would
      // collapse all twelve to zero length.
      const windowStart = live
        ? Math.max(new Date(window.start).getTime(), nowMs)
        : new Date(window.start).getTime();
      const windowEnd = new Date(window.end).getTime();
      const span = Math.min(90 * 60000, Math.max(30 * 60000, (windowEnd - windowStart) / 2));
      const blockStart = windowStart + offsetMs;
      const blockEnd = Math.min(blockStart + span, windowEnd);

      if (blockEnd - blockStart >= 15 * 60000) {
        slot = { start: blockStart, end: blockEnd, planet: window.planet };
        offsetMs = blockEnd - windowStart;
        if (blockEnd >= windowEnd - 60000) {
          cursor += 1;
          offsetMs = 0;
        }
        break;
      }
      cursor += 1;
      offsetMs = 0;
    }
    if (!slot) break;

    blocks.push({
      id: task.id,
      title: task.title,
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.end).toISOString(),
      done: task.status === "Done",
      vision: project
        ? visionLine(project, input.clients, input.companies, input.currency)
        : "Not linked to a project — link it in Notion so its value shows here.",
      projectName: project?.name,
      milestone: project?.deadline
        ? project.deadline < input.todayISO
          ? "late"
          : project.deadline === input.todayISO
            ? "today"
            : null
        : null,
      planet: slot.planet,
    });
  }

  return { blocks, live };
}
