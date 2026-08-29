// The Today dashboard as a single value.
//
// This exists so that the page and the Assistant cannot disagree. Before it,
// the derivation — energy, capacity, metric cards, the schedule, the greeting
// — lived inline in app/page.tsx, and the chat route built its own smaller
// picture from getTodayContext(). The model would then confidently discuss a
// "6.5h capacity" the screen had never shown, because the two paths applied
// different inputs. An assistant that can edit the UI has to be looking at the
// same UI the user is, so both callers now go through buildTodayView() and
// read the same object.
//
// describeUiState() is the same object rendered for a system prompt: every
// figure that appears on screen, in the words the screen uses, plus which of
// them are currently manual overrides rather than calculations.

import { getTodayContext, type TodayContext } from "./context";
import {
  getPayments,
  getClients,
  getIdeas,
  getLearningTopics,
  getFinanceGoals,
  getIncome,
  getSleepLogs,
} from "./notion";
import { computeDayEnergy, buildGreeting, focusWindows, focusHoursRemaining, type DayEnergy, type Greeting } from "./dayEnergy";
import {
  deepWorkCapacity,
  metricCards,
  scheduleToday,
  visionLine,
  type DeepWorkCapacity,
  type MetricCard,
  type ScheduledBlock,
} from "./dashboard";
import { formatLocalTime, localDateISO, localHour, tzOffset } from "./timezone";
import { getUiOverrides, type UiOverrides } from "./uiOverrides";
import { currentUser } from "@/auth";

/**
 * Compact money, shared by the metric cards and their company badges.
 *
 * "Rs" rather than "LKR" on purpose: six cards across, the four-character
 * prefix pushed the value onto a second line and broke the row's rhythm.
 * The goals panel is full-width and uses the long form.
 */
export function money(n: number, currency = "USD") {
  const symbol = currency === "LKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${symbol}${Math.round(n / 1000)}k`;
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

export interface TodayView {
  ctx: TodayContext;
  todayISO: string;
  offset: number;
  now: Date;
  greeting: Greeting;
  /** True when the greeting line on screen came from chat, not the clock. */
  greetingManual: boolean;
  energy: DayEnergy;
  capacity: DeepWorkCapacity;
  cards: (MetricCard & { manual?: boolean })[];
  schedule: { blocks: ScheduledBlock[]; live: boolean };
  /** True when the blocks on screen were placed by chat, not by the allocator. */
  scheduleManual: boolean;
  currency: string;
  goalCurrency: string;
  payments: Awaited<ReturnType<typeof getPayments>>;
  clients: Awaited<ReturnType<typeof getClients>>;
  ideas: Awaited<ReturnType<typeof getIdeas>>;
  learningTopics: Awaited<ReturnType<typeof getLearningTopics>>;
  financeGoals: Awaited<ReturnType<typeof getFinanceGoals>>;
  sleepHours?: number;
  overrides: UiOverrides;
}

/** "09:30" on the user's clock -> the ISO instant for that time today. */
function wallClockToISO(hhmm: string, todayISO: string, offset: number): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  const utcMs = Date.UTC(
    Number(todayISO.slice(0, 4)),
    Number(todayISO.slice(5, 7)) - 1,
    Number(todayISO.slice(8, 10)),
    (Number.isFinite(h) ? h : 9) - offset / 60,
    Number.isFinite(m) ? m : 0
  );
  return new Date(utcMs).toISOString();
}

export async function buildTodayView(dateISO: string = localDateISO()): Promise<TodayView> {
  const todayISO = dateISO;
  const offset = tzOffset();
  const now = new Date();
  const ctx = await getTodayContext(todayISO);

  const [payments, clients, ideas, learningTopics, financeGoals, income, sleepLogs] = ctx.connected
    ? await Promise.all([
        getPayments(),
        getClients(),
        getIdeas(),
        getLearningTopics(),
        getFinanceGoals(),
        getIncome(),
        getSleepLogs(3),
      ])
    : [[], [], [], [], [], [], []];

  const overrides = await getUiOverrides(todayISO);
  const energy = computeDayEnergy({ horaDay: ctx.horaDay, panchang: ctx.panchang, personalDay: ctx.personalDay });

  /* ---------- capacity: the sky's ceiling and the body's ---------- */
  const windows = focusWindows(ctx.horaDay, ctx.panchang);
  const lastSleep = sleepLogs.find((s) => s.durationHours !== undefined);
  const capacity = deepWorkCapacity({
    horaHours: focusHoursRemaining(windows, now),
    sleepHours: lastSleep?.durationHours,
    energyLevel: ctx.recentLogs[0]?.energyLevel,
  });

  /* ---------- money ---------- */
  const currency = income.find((i) => i.currency)?.currency || payments.find((p) => p.currency)?.currency || "USD";
  const goalCurrency = currency === "USD" ? "USD" : currency;

  const computedCards = metricCards({
    companies: ctx.companies,
    projects: ctx.projects,
    clients,
    tasks: ctx.tasks,
    payments,
    income,
    todayISO,
    capacity,
    money,
  });

  // A metric the chat set keeps the card's label, splits and tone but shows the
  // value it was given, flagged. The splits are left alone deliberately: they
  // are still the real per-company breakdown, and silently blanking them would
  // hide the discrepancy rather than expose it.
  const cards = computedCards.map((c) => {
    const o = overrides.metrics?.[c.key];
    if (!o) return c;
    return { ...c, display: o.display, foot: o.note || `Set manually · was ${c.display}`, manual: true };
  });

  /* ---------- the plan, laid onto the clock ---------- */
  const live = ctx.projects.filter((p) => p.status !== "Delivered");
  const dueToday = ctx.tasks.filter((t) => t.dueDate === todayISO && t.status !== "Done");
  const shippingToday = live.filter((p) => p.deadline === todayISO);

  const schedule = scheduleToday({
    tasks: dueToday,
    projects: ctx.projects,
    clients,
    companies: ctx.companies,
    currency,
    windows,
    todayISO,
    now,
  });
  // Project deadlines landing today aren't tasks and can't be ticked, but they
  // would be invisible on the one day they matter most.
  for (const p of shippingToday) {
    if (dueToday.some((t) => t.projectId === p.id)) continue;
    schedule.blocks.push({
      id: `project:${p.id}`,
      title: p.name,
      start: ctx.panchang?.sunset ?? new Date(now.getTime() + 3600_000).toISOString(),
      end: ctx.panchang?.sunset ?? new Date(now.getTime() + 3600_000).toISOString(),
      done: false,
      vision: visionLine(p, clients, ctx.companies, currency),
      milestone: "today",
    });
  }

  // A schedule override replaces the allocator's placement wholesale. Merging
  // the two would produce a plan neither the user nor the allocator asked for,
  // and the point of "move the client call to 4pm" is that the result is what
  // was asked for.
  let scheduleManual = false;
  if (overrides.schedule?.blocks?.length) {
    scheduleManual = true;
    const byTask = new Map(schedule.blocks.map((b) => [b.id.replace(/^task:/, ""), b]));
    schedule.blocks = overrides.schedule.blocks.map((b, i) => {
      const existing = b.taskId ? byTask.get(b.taskId) : undefined;
      return {
        id: existing?.id ?? `manual:${i}`,
        title: b.title,
        start: wallClockToISO(b.start, todayISO, offset),
        end: wallClockToISO(b.end, todayISO, offset),
        done: existing?.done ?? false,
        vision: b.note || existing?.vision || "Placed by you in chat",
        projectName: existing?.projectName,
        milestone: existing?.milestone ?? null,
        planet: existing?.planet,
      };
    });
    schedule.live = true;
  }

  /* ---------- header ---------- */
  const user = await currentUser();
  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const computedGreeting = buildGreeting({
    hour: localHour(),
    month: Number(todayISO.slice(5, 7)),
    energy,
    personalDay: ctx.personalDay,
    sleepHours: lastSleep?.durationHours,
    name: firstName,
    title: "CEO",
  });

  const greeting: Greeting = overrides.greeting
    ? { ...computedGreeting, line: overrides.greeting.line, gloss: overrides.greeting.reason }
    : computedGreeting;

  // A focus override doesn't fabricate a reason — it promotes one. The line the
  // user asked the day to be built around goes to the front of the list the
  // synthesis card reads, and the calculated reasons follow it unchanged.
  if (overrides.focus) {
    energy.reasons = [`Focus set by you: ${overrides.focus.focus}`, ...energy.reasons];
  }

  return {
    ctx,
    todayISO,
    offset,
    now,
    greeting,
    greetingManual: Boolean(overrides.greeting),
    energy,
    capacity,
    cards,
    schedule,
    scheduleManual,
    currency,
    goalCurrency,
    payments,
    clients,
    ideas,
    learningTopics,
    financeGoals,
    sleepHours: lastSleep?.durationHours,
    overrides,
  };
}

/**
 * The dashboard as the model sees it.
 *
 * Deliberately quotes the on-screen strings verbatim — "$12k", "3 due" — rather
 * than raw numbers. When the user says "the revenue card is wrong", the model
 * has to be able to name what is currently displayed before it can explain why
 * it is displayed, and a re-formatted number is a different string to the one
 * they are looking at.
 */
export function describeUiState(view: TodayView): string {
  const t = (iso: string) => formatLocalTime(iso, view.offset);
  const lines: string[] = [];

  lines.push("=== WHAT IS ON THE USER'S SCREEN RIGHT NOW (the Today dashboard) ===");
  lines.push(
    `Header: date "${new Date(`${view.todayISO}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}", clock reads ${t(view.now.toISOString())} (UTC${view.offset >= 0 ? "+" : ""}${(view.offset / 60).toFixed(1)}).`
  );
  lines.push(
    `currentGreeting: "${view.greeting.line}" (${view.greeting.band}, gloss "${view.greeting.gloss}")` +
      (view.greetingManual ? " — MANUAL OVERRIDE set from chat, not the clock." : " — derived from local hour + tithi.")
  );
  lines.push(`Positive-energy banner reads: "${view.greeting.vibe}"`);

  lines.push(
    `dailySynthesis: score ${view.energy.score}/100, verdict "${view.energy.verdict}" — "${view.energy.headline}"`
  );
  lines.push("dailySynthesis.reasons (shown as bullets on the synthesis card):");
  view.energy.reasons.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  if (view.overrides.focus) lines.push(`  focusOverride currently active: "${view.overrides.focus.focus}"`);

  if (view.energy.deepWork) {
    lines.push(
      `calculatedPeakHours (deep-work block on screen): ${t(view.energy.deepWork.start)}–${t(view.energy.deepWork.end)} ` +
        `"${view.energy.deepWork.label}" on ${view.energy.deepWork.planets.join(" + ")} horas. Reason shown: ${view.energy.deepWork.reason}`
    );
  } else {
    lines.push("calculatedPeakHours: no deep-work block is shown today.");
  }
  if (view.energy.rest) {
    lines.push(
      `restWindows (rest & reset banner): ${t(view.energy.rest.start)}–${t(view.energy.rest.end)}. Reason shown: ${view.energy.rest.reason}`
    );
  } else {
    lines.push("restWindows: no rest banner is shown today.");
  }
  lines.push(
    `Deep-work capacity: ${view.capacity.label} (${view.capacity.tone}) — "${view.capacity.reason}"` +
      (view.sleepHours !== undefined ? `. Last sleep logged: ${view.sleepHours.toFixed(1)}h.` : ". No sleep logged.")
  );

  lines.push(`topMetrics — the six cards, left to right, exactly as displayed:`);
  for (const c of view.cards) {
    const splits = c.splits.length
      ? " [" + c.splits.map((s) => `${s.name} ${c.splitFormat === "money" ? money(s.value, c.splitCurrency) : s.value}`).join(", ") + "]"
      : "";
    lines.push(
      `  key="${c.key}" label="${c.label}" showing "${c.display}"${splits}` +
        (c.foot ? ` foot="${c.foot}"` : "") +
        ((c as any).manual ? "  ← MANUAL OVERRIDE, not a calculation" : "")
    );
  }

  lines.push(
    `calendarPlan (${view.schedule.blocks.length} block${view.schedule.blocks.length === 1 ? "" : "s"}` +
      (view.scheduleManual ? ", MANUALLY SET FROM CHAT" : ", placed by the hora allocator") +
      (view.schedule.live ? "" : ", the day's windows have already passed") +
      "):"
  );
  if (!view.schedule.blocks.length) lines.push("  (empty — nothing is due today)");
  for (const b of view.schedule.blocks) {
    lines.push(
      `  ${t(b.start)}–${t(b.end)} ${b.done ? "[done] " : ""}${b.title}` +
        (b.planet ? ` (${b.planet} hora)` : "") +
        (b.milestone === "late" ? " — OVERDUE" : b.milestone === "today" ? " — ships today" : "") +
        (b.id.startsWith("task:") ? ` taskId=${b.id.slice(5)}` : "")
    );
  }

  const openTasks = view.ctx.tasks.filter((t2) => t2.status !== "Done");
  lines.push(
    `activeTasks: ${openTasks.length} open overall, ${view.ctx.tasksDueToday.length} due today` +
      (view.ctx.tasksDueToday.length
        ? ": " + view.ctx.tasksDueToday.slice(0, 12).map((t2) => `${t2.title} (${t2.id})`).join(", ")
        : ".")
  );
  lines.push(
    `Finance goals panel: ${view.financeGoals.length} goal${view.financeGoals.length === 1 ? "" : "s"}` +
      (view.financeGoals.length
        ? ": " + view.financeGoals.slice(0, 6).map((g: any) => `${g.goal} ${money(g.currentAmount || 0, view.goalCurrency)}/${money(g.targetAmount || 0, view.goalCurrency)}`).join(", ")
        : ".")
  );

  lines.push(
    "Override rules you must follow: the greeting, the day's time blocks, a metric card's figure and the synthesis focus " +
      "are the ONLY things you may change on this screen, via update_dashboard_greeting / modify_daily_schedule / " +
      "update_metrics_and_goals / resynthesize_day_analysis. They are scoped to today only and reset tomorrow. " +
      "Anything else the user wants changed is a record, and has to be changed with the create_* tools or in Notion."
  );

  return lines.join("\n");
}
