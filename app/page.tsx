import { getTodayContext } from "@/lib/context";
import {
  getPayments,
  getClients,
  getIdeas,
  getLearningTopics,
  getFinanceGoals,
  getIncome,
} from "@/lib/notion";
import { listCalendarEvents } from "@/lib/googleCalendar";
import { HORA_PROFILE } from "@/lib/hora";
import { computeDayEnergy, sinhalaGreeting } from "@/lib/dayEnergy";
import { cashFlow, executionLoad, revenuePulse, visionLine } from "@/lib/dashboard";
import { formatLocalTime, localDateISO, localHour, tzOffset } from "@/lib/timezone";
import ConnectPrompt from "@/components/ConnectPrompt";
import DayPlanCard from "@/components/DayPlanCard";
import ExecutiveSummary from "@/components/today/ExecutiveSummary";
import MetricRow from "@/components/today/MetricRow";
import DayPlanColumn, { type PlanSlot, type PlanTask } from "@/components/today/DayPlanColumn";
import GrowthHub from "@/components/today/GrowthHub";
import { currentUser } from "@/auth";

/**
 * What to call the whole operation, read off the workspace rather than
 * written into the code — this page is served to whoever signs in, and their
 * company is not the same as anyone else's.
 *
 * Companies named "Orex", "Orex Studio" and "Orex Labs" are one group with a
 * shared name, so the greeting says "Orex Group" rather than listing three.
 * With no common stem it falls back to the first company, which is at least
 * true.
 */
function groupName(names: string[]): string {
  if (names.length === 0) return "your workspace";
  if (names.length === 1) return names[0];

  const firstWords = names.map((n) => n.trim().split(/\s+/)[0]);
  const stem = firstWords[0];
  if (stem && firstWords.every((w) => w.toLowerCase() === stem.toLowerCase())) {
    return `${stem} Group`;
  }
  return names[0];
}

export default async function TodayPage() {
  const todayISO = localDateISO();
  const ctx = await getTodayContext(todayISO);

  const [payments, clients, ideas, learningTopics, financeGoals, income] = ctx.connected
    ? await Promise.all([getPayments(), getClients(), getIdeas(), getLearningTopics(), getFinanceGoals(), getIncome()])
    : [[], [], [], [], [], []];

  // Calendar is optional and lives behind a service account that may not be
  // configured; it returns [] rather than throwing, so it can't take the
  // dashboard down.
  const events = ctx.connected ? await listCalendarEvents(todayISO) : [];

  const energy = computeDayEnergy({ horaDay: ctx.horaDay, panchang: ctx.panchang, personalDay: ctx.personalDay });

  const pulse = revenuePulse({ payments, income, companies: ctx.companies, todayISO });
  const load = executionLoad({ projects: ctx.projects, tasks: ctx.tasks, todayISO });
  const cash = cashFlow({ payments, clients, events, panchang: ctx.panchang, todayISO });

  /* ---------- left column: the day on a clock ---------- */
  const slots: PlanSlot[] = [];
  if (energy.deepWork) {
    slots.push({
      start: energy.deepWork.start,
      end: energy.deepWork.end,
      title: `Deep work — ${energy.deepWork.label}`,
      kind: "deep",
      note: energy.deepWork.planets.map((p) => HORA_PROFILE[p as keyof typeof HORA_PROFILE].quality).join(" then "),
    });
  }
  if (ctx.panchang) {
    slots.push(
      { start: ctx.panchang.rahuKalam.start, end: ctx.panchang.rahuKalam.end, title: "Rahu Kalam", kind: "blocked", note: "No launches, sign-offs, cold outreach or live deploys" },
      { start: ctx.panchang.yamagandam.start, end: ctx.panchang.yamagandam.end, title: "Yamagandam", kind: "blocked", note: "Route study and asset work here" },
    );
  }
  if (energy.rest) {
    slots.push({ start: energy.rest.start, end: energy.rest.end, title: "Reset & recharge", kind: "rest", note: energy.rest.label });
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));

  /* ---------- left column: what ships, and what that buys ---------- */
  const projectById = new Map(ctx.projects.map((p) => [p.id, p]));
  const planTasks: PlanTask[] = [
    ...load.dueToday.map((t) => {
      const project = projectById.get(t.projectId);
      return {
        id: t.id,
        title: t.title,
        done: t.status === "Done",
        projectName: project?.name,
        vision: project
          ? visionLine(project, clients, ctx.companies, pulse.currency)
          : "Not linked to a project — link it in Notion so its value shows here.",
        milestone: project?.deadline
          ? project.deadline < todayISO
            ? ("late" as const)
            : project.deadline === todayISO
              ? ("today" as const)
              : ("week" as const)
          : null,
        due: project?.deadline,
      };
    }),
    // Projects whose own deadline is today but that carry no task — they'd
    // otherwise be invisible on the one day they matter most.
    ...load.shippingToday
      .filter((p) => !load.dueToday.some((t) => t.projectId === p.id))
      .map((p) => ({
        id: `project:${p.id}`,
        title: p.name,
        done: false,
        projectName: undefined,
        vision: visionLine(p, clients, ctx.companies, pulse.currency),
        milestone: "today" as const,
        due: p.deadline,
      })),
  ];

  /* ---------- header ---------- */
  const user = await currentUser();
  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const greeting = sinhalaGreeting(localHour());
  const today = new Date(`${ctx.dateISO}T12:00:00Z`);
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const triggered = ctx.rules.filter((r) => r.triggered);

  const orgLabel = `CEO of ${groupName(ctx.companies.map((c) => c.name))}`;

  return (
    <>
      <div className="topbar today-bar">
        <div className="greet">
          <div className="greet-meta">
            <span className="greet-date">{dateLabel}</span>
            <span className={`greet-pill ${greeting.band.toLowerCase()}`}>
              <span className="status-dot" />
              {greeting.band} · {greeting.gloss}
            </span>
          </div>
          <h1 className="greet-line">
            {greeting.sinhala}
            {firstName ? `, ${firstName}` : ""}
            <span className="greet-role"> — CEO</span>
          </h1>
          <div className="greet-sub">
            {energy.moon.rasi} Moon · {energy.moon.nakshatra}
            {energy.currentHora ? ` · ${energy.currentHora.planet} hora until ${formatLocalTime(energy.currentHora.end)}` : ""}
            {ctx.personalDay !== null ? ` · Personal Day ${ctx.personalDay}` : ""}
          </div>
        </div>
        <div className="topbar-actions">
          <a href="/advisor" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18M3 12h18" />
            </svg>
            Ask Advisor
          </a>
        </div>
      </div>

      {ctx.activeWindow && (
        <section className="card window-alert">
          <span className="wa-dot" aria-hidden />
          <div>
            <strong>{ctx.activeWindow.name} is running</strong> until {formatLocalTime(ctx.activeWindow.window.end)} — hold
            launches, contract sign-offs, cold outreach and live deploys. Put study, documentation or asset organisation
            here instead.
          </div>
        </section>
      )}

      <ExecutiveSummary energy={energy} name={firstName} org={orgLabel} triggered={triggered} />

      {!ctx.connected && <ConnectPrompt />}

      {ctx.connected && (
        <>
          <MetricRow
            pulse={pulse}
            load={load}
            cash={cash}
            energy={energy}
            energyLevel={ctx.recentLogs[0]?.energyLevel}
          />

          <section className="today-split">
            <div className="split-col">
              <DayPlanColumn slots={slots} tasks={planTasks} meetings={cash.meetings} tzOffset={tzOffset()} />
              <DayPlanCard />
            </div>
            <GrowthHub goals={financeGoals} learning={learningTopics} ideas={ideas} todayISO={todayISO} />
          </section>
        </>
      )}

      <div className="footnote">
        Orex OS — Today · {ctx.connected ? "live data from Notion" : "connect Notion to see live data"}
      </div>
    </>
  );
}
