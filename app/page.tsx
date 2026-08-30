import { buildTodayView, money } from "@/lib/uiState";
import { formatLocalTime } from "@/lib/timezone";
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
import WorkWindowCard from "@/components/today/WorkWindowCard";
import { isGoogleCalendarConnected } from "@/lib/googleCalendar";

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

/**
 * The dashboard renders `buildTodayView()` and nothing else.
 *
 * Every derived figure — greeting, energy, capacity, cards, schedule — comes
 * from that one function, which the Assistant's chat route also calls. That is
 * what makes "the revenue card says $12k" a statement the model can verify
 * rather than guess at: there is only one place the number is computed.
 */
export default async function TodayPage() {
  const view = await buildTodayView();
  const { ctx, offset, now, greeting, energy, cards, schedule, overrides, workWindow, plan } = view;

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
          <h1 className="th-greeting">
            {greeting.line}
            {view.greetingManual && (
              <span className="manual-flag" title={overrides.greeting?.reason || "Set from chat"}>
                set by you
              </span>
            )}
          </h1>
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
          {/* Above the metrics on purpose: the hours govern every allocation
              below them, and stating them is the first move of the morning. */}
          <WorkWindowCard
            window={workWindow}
            plan={plan}
            tzOffset={offset}
            calendarConnected={isGoogleCalendarConnected()}
          />

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
            <SchedulePanel
              blocks={schedule.blocks}
              live={schedule.live}
              tzOffset={offset}
              manualNote={view.scheduleManual ? overrides.schedule?.reason : undefined}
            />
            <FinanceGoalsPanel goals={view.financeGoals} currency={view.goalCurrency} todayISO={view.todayISO} />
          </section>

          <section className="today-split">
            <LearningPanel topics={view.learningTopics} />
            <QuickAdds recent={view.ideas} />
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
