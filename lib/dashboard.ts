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
