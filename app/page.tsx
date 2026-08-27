import { getTodayContext } from "@/lib/context";
import {
  getPayments,
  getClients,
  getIdeas,
  getLearningTopics,
  getFinanceGoals,
  getIncome,
  getSleepLogs,
} from "@/lib/notion";
import { computeDayEnergy, buildGreeting, focusWindows, focusHoursRemaining } from "@/lib/dayEnergy";
import { deepWorkCapacity, metricCards, scheduleToday, visionLine } from "@/lib/dashboard";
import { formatLocalTime, localDateISO, localHour, tzOffset } from "@/lib/timezone";
import ConnectPrompt from "@/components/ConnectPrompt";
import DayPlanCard from "@/components/DayPlanCard";
import LiveClock from "@/components/today/LiveClock";
import SynthesisCard from "@/components/today/SynthesisCard";
import TransitStrip from "@/components/today/TransitStrip";
import MetricGrid from "@/components/today/MetricGrid";
import SchedulePanel from "@/components/today/SchedulePanel";
import FinanceGoalsPanel from "@/components/today/FinanceGoalsPanel";
import LearningPanel from "@/components/today/LearningPanel";
import QuickAdds from "@/components/today/QuickAdds";
import { currentUser } from "@/auth";

/**
 * Compact money, shared by the metric cards and their company badges.
 *
 * "Rs" rather than "LKR" on purpose: six cards across, the four-character
 * prefix pushed the value onto a second line and broke the row's rhythm.
 * The goals panel is full-width and uses the long form.
 */
function money(n: number, currency = "USD") {
  const symbol = currency === "LKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${symbol}${Math.round(n / 1000)}k`;
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

/**
 * What to call the whole operation, read off the workspace rather than
 * written into the code — this page is served to whoever signs in, and their
 * company is not the same as anyone else's. Companies named "Orex", "Orex
 * Studio" and "Orex Labs" are one group with a shared name, so it says "Orex
 * Group" rather than listing three.
 */
function groupName(names: string[]): string {
  if (names.length === 0) return "your workspace";
  if (names.length === 1) return names[0];
  const firstWords = names.map((n) => n.trim().split(/\s+/)[0]);
  const stem = firstWords[0];
  if (stem && firstWords.every((w) => w.toLowerCase() === stem.toLowerCase())) return `${stem} Group`;
  return names[0];
}

export default async function TodayPage() {
  const todayISO = localDateISO();
  const offset = tzOffset();
  const ctx = await getTodayContext(todayISO);
  const now = new Date();

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

  const cards = metricCards({
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

  /* ---------- header ---------- */
  const user = await currentUser();
  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const greeting = buildGreeting({
    hour: localHour(),
    month: Number(todayISO.slice(5, 7)),
    energy,
    personalDay: ctx.personalDay,
    sleepHours: lastSleep?.durationHours,
    name: firstName,
    title: "CEO",
  });
  const dateLabel = new Date(`${ctx.dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const triggered = ctx.rules.filter((r) => r.triggered);
  const org = groupName(ctx.companies.map((c) => c.name));

  return (
    <>
      {/* ---------- header ---------- */}
      <header className="today-head">
        <div className="th-left">
          <div className="th-date">{dateLabel}</div>
          <h1 className="th-greeting">{greeting.line}</h1>
        </div>
        <LiveClock initial={formatLocalTime(now, offset)} tzOffset={offset} />
      </header>

      {/* ---------- positive energy banner ---------- */}
      <section className="good-banner">
        <h2>Good things about the day — why today is good</h2>
        <p>{greeting.vibe}</p>
      </section>

      <SynthesisCard
        energy={energy}
        personalDay={ctx.personalDay}
        oddCalendarDay={ctx.features.dayOfMonthOdd}
        triggered={triggered}
      />

      <TransitStrip panchang={ctx.panchang} activeName={ctx.activeWindow?.name} />

      {!ctx.connected && <ConnectPrompt />}

      {ctx.connected && (
        <>
          <MetricGrid cards={cards} money={money} />

          {/* ---------- rest & recharge ---------- */}
          {energy.rest && (
            <section className="rest-banner">
              <div className="rb-head">
                <span className="rb-tag">Rest &amp; reset</span>
                <span className="rb-time">
                  {formatLocalTime(energy.rest.start, offset)} – {formatLocalTime(energy.rest.end, offset)}
                </span>
              </div>
              <p className="rb-body">{energy.rest.reason}</p>
            </section>
          )}

          <section className="today-split">
            <SchedulePanel blocks={schedule.blocks} live={schedule.live} tzOffset={offset} />
            <FinanceGoalsPanel goals={financeGoals} currency={goalCurrency} todayISO={todayISO} />
          </section>

          <section className="today-split">
            <LearningPanel topics={learningTopics} />
            <QuickAdds recent={ideas} />
          </section>

          <section style={{ marginBottom: 16 }}>
            <DayPlanCard />
          </section>
        </>
      )}

      <div className="footnote">
        Orex OS — {org} · {ctx.connected ? "live data from Notion" : "connect Notion to see live data"}
      </div>
    </>
  );
}
