// Assembles the "what does the advisor know about today" bundle, shared by
// the Today dashboard and the /api/chat route so both give consistent
// answers grounded in the same live data.

import { notionConnected, getCompanies, getCoreRules, getProjects, getTasks, getPayments, getDailyLogs, getClients } from "./notion";
import { buildRuleVars, evaluateRules, timingLabel } from "./rulesEngine";
import { dateFeatures, lifePathNumber, personalDayNumber } from "./numerology";
import { getPanchangWindows, activeWindowNow } from "./panchang";
import { localDateISO } from "./timezone";
import { setting } from "./settings";

export async function getTodayContext(dateISO: string = localDateISO()) {
  // Your birth date, used for numerology — settings-store override (from
  // the Settings page) wins over .env.local's BIRTH_DATE.
  const BIRTH_DATE = setting("birthDate", "BIRTH_DATE");
  const features = dateFeatures(dateISO);
  const personalDay = BIRTH_DATE ? personalDayNumber(BIRTH_DATE, dateISO) : null;
  const lifePath = BIRTH_DATE ? lifePathNumber(BIRTH_DATE) : null;
  // Doesn't depend on Notion or any astrology API key — computed locally
  // from free sunrise/sunset data, see lib/panchang.ts.
  const panchang = await getPanchangWindows(dateISO);
  const activeWindow = activeWindowNow(panchang);

  if (!(await notionConnected())) {
    return {
      connected: false,
      dateISO,
      features,
      personalDay,
      lifePath,
      panchang,
      activeWindow,
      rules: [],
      timing: { label: "Connect Notion to see today's timing", tone: "neutral" as const },
      companies: [],
      activeProjects: [],
      tasksDueToday: [],
      overduePayments: [],
      recentLogs: [],
      clients: [],
      payments: [],
      projects: [],
      tasks: [],
    };
  }

  const [companies, rules, projects, tasks, payments, logs, clients] = await Promise.all([
    getCompanies(),
    getCoreRules(),
    getProjects(),
    getTasks(),
    getPayments(),
    getDailyLogs(7),
    getClients(),
  ]);

  const vars = buildRuleVars(dateISO, BIRTH_DATE);
  const evaluated = evaluateRules(rules, { ...vars, personal_day_number: personalDay });
  const timing = timingLabel(evaluated);

  const activeProjects = projects.filter((p) => p.status !== "Delivered");
  const tasksDueToday = tasks.filter((t) => t.dueDate === dateISO && t.status !== "Done");
  const overduePayments = payments.filter((p) => p.status === "Overdue");

  return {
    connected: true,
    dateISO,
    features,
    personalDay,
    lifePath,
    panchang,
    activeWindow,
    rules: evaluated,
    timing,
    companies,
    activeProjects,
    tasksDueToday,
    overduePayments,
    recentLogs: logs,
    clients,
    payments,
    projects,
    tasks,
  };
}

export type TodayContext = Awaited<ReturnType<typeof getTodayContext>>;

/** Compact, token-cheap text summary for the AI advisor's system prompt. */
export function summarizeContextForAI(ctx: TodayContext): string {
  const lines: string[] = [];
  lines.push(`Today: ${ctx.dateISO} (${ctx.features.weekdayName}).`);
  if (ctx.personalDay !== null) lines.push(`Personal Day Number: ${ctx.personalDay}. Life Path: ${ctx.lifePath}.`);
  lines.push(`Timing verdict: ${ctx.timing.label}.`);

  if (ctx.panchang) {
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    lines.push(
      `Today's inauspicious windows (avoid cold outreach, live deploys, contract sign-offs, new company filings — ` +
        `route study/documentation/asset-organization into these instead): ` +
        `Rahu Kalam ${fmt(ctx.panchang.rahuKalam.start)}-${fmt(ctx.panchang.rahuKalam.end)}, ` +
        `Yamagandam ${fmt(ctx.panchang.yamagandam.start)}-${fmt(ctx.panchang.yamagandam.end)}, ` +
        `Gulika Kalam ${fmt(ctx.panchang.gulikaKalam.start)}-${fmt(ctx.panchang.gulikaKalam.end)}.`
    );
    if (ctx.activeWindow) {
      lines.push(`RIGHT NOW is inside ${ctx.activeWindow.name} — actively warn against starting anything high-stakes.`);
    }
  }

  const triggered = ctx.rules.filter((r) => r.triggered);
  if (triggered.length) {
    lines.push("Triggered rules today:");
    for (const r of triggered) lines.push(`- ${r.rule}: ${r.guidance} (condition: ${r.condition})`);
  }

  if (ctx.connected) {
    lines.push(`Active projects: ${ctx.activeProjects.length}. Tasks due today: ${ctx.tasksDueToday.length}.`);
    if (ctx.overduePayments.length) {
      lines.push(
        `Overdue payments: ${ctx.overduePayments.map((p) => `${p.label} ($${p.amount})`).join(", ")}.`
      );
    }
    if (ctx.recentLogs.length) {
      lines.push(
        "Recent daily logs (most recent first): " +
          ctx.recentLogs
            .slice(0, 5)
            .map((l) => `${l.date}: mood ${l.moodScore ?? "?"}, energy ${l.energyLevel ?? "?"}${l.notes ? ` — ${l.notes}` : ""}`)
            .join(" | ")
      );
    }
  } else {
    lines.push("Notion is not connected yet — no live project/task/payment/log data available.");
  }

  return lines.join("\n");
}
