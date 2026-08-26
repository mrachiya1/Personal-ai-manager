import { getTodayContext } from "@/lib/context";
import { getPayments, getClients, getIdeas, getLearningTopics, getFinanceGoals, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import IdeaCapture from "@/components/IdeaCapture";
import DayPlanCard from "@/components/DayPlanCard";
import { localDateISO } from "@/lib/timezone";
import { currentUser } from "@/auth";

const priorityBadgeClass: Record<string, string> = { High: "badge high", Medium: "badge med", Low: "badge low" };
const paymentBadgeClass: Record<string, string> = {
  Overdue: "badge overdue",
  Pending: "badge pending",
  "Partially Paid": "badge pending",
  Paid: "badge paid",
};

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
}

const toneCopy = {
  good: { pill: "GOOD DAY", big: "Favorable for deep work", bg: "rgba(12,163,12,0.05)" },
  warning: { pill: "USE CAUTION", big: "Slow down on big moves today", bg: "rgba(250,178,25,0.08)" },
  neutral: { pill: "NEUTRAL DAY", big: "No strong signal either way", bg: "rgba(11,11,11,0.02)" },
};

export default async function TodayPage() {
  const ctx = await getTodayContext();
  const tone = toneCopy[ctx.timing.tone];

  const [payments, clients, ideas, learningTopics, financeGoals] = ctx.connected
    ? await Promise.all([getPayments(), getClients(), getIdeas(), getLearningTopics(), getFinanceGoals()])
    : [[], [], [], [], []];

  const renderQueue = ctx.connected
    ? ctx.projects.filter((p) => p.status === "Rendering-Ready").sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    : [];
  const overdue = payments.filter((p) => p.status === "Overdue");

  const in3Days = new Date(localDateISO() + "T00:00:00");
  in3Days.setDate(in3Days.getDate() + 3);
  const upcomingDeadlines = ctx.connected
    ? ctx.projects.filter((p) => p.status !== "Delivered" && p.deadline && p.deadline >= localDateISO() && p.deadline <= in3Days.toISOString().slice(0, 10))
    : [];
  const notifications = ctx.connected
    ? [
        ...(overdue.length ? [{ text: `${overdue.length} overdue payment${overdue.length === 1 ? "" : "s"}`, tone: "critical" as const }] : []),
        ...(ctx.tasksDueToday.length ? [{ text: `${ctx.tasksDueToday.length} task${ctx.tasksDueToday.length === 1 ? "" : "s"} due today`, tone: "warn" as const }] : []),
        ...(upcomingDeadlines.length ? [{ text: `${upcomingDeadlines.length} project deadline${upcomingDeadlines.length === 1 ? "" : "s"} in the next 3 days`, tone: "warn" as const }] : []),
        ...(renderQueue.length ? [{ text: `${renderQueue.length} project${renderQueue.length === 1 ? "" : "s"} queued to render`, tone: "info" as const }] : []),
      ]
    : [];
  const clientById = (id: string) => clients.find((c) => c.id === id);
  const activeProjects = ctx.connected ? ctx.projects.filter((p) => p.status !== "Delivered") : [];
  const triggered = ctx.rules.filter((r) => r.triggered);

  const today = new Date(ctx.dateISO + "T00:00:00");
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // Greet whoever is actually signed in. In single-user local mode there is no
  // account, so it stays a plain greeting rather than naming anyone.
  const user = await currentUser();
  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const greeting = firstName ? `Good morning, ${firstName}` : "Good morning";

  return (
    <>
      <div className="topbar">
        <div>
          <div className="date">{dateLabel}</div>
          <h1 className="brand-serif">{greeting}</h1>
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
        <section
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "rgba(161,36,36,0.06)",
            border: "1px solid rgba(161,36,36,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>⛔</span>
          <div style={{ fontSize: 13.5 }}>
            <strong>{ctx.activeWindow.name} is active</strong> until{" "}
            {new Date(ctx.activeWindow.window.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            {" — "}hold off on launches, contract sign-offs, cold outreach, and live deploys. Good window for
            study, documentation, or organizing assets instead.
          </div>
        </section>
      )}

      {ctx.panchang && !ctx.activeWindow && (
        <section
          className="card"
          style={{ marginBottom: 16, padding: "10px 16px", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-muted)" }}
        >
          <span>
            Rahu Kalam {new Date(ctx.panchang.rahuKalam.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–
            {new Date(ctx.panchang.rahuKalam.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span>
            Yamagandam {new Date(ctx.panchang.yamagandam.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–
            {new Date(ctx.panchang.yamagandam.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span>
            Gulika Kalam {new Date(ctx.panchang.gulikaKalam.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–
            {new Date(ctx.panchang.gulikaKalam.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </section>
      )}

      {/* Timing hero */}
      <section className="card hero">
        <div className="hero-status" style={{ background: `linear-gradient(180deg, ${tone.bg}, transparent)` }}>
          <span className="status-pill">
            <span className="status-dot" />
            {tone.pill}
          </span>
          <div className="big">{tone.big}</div>
          <div className="sub">
            {ctx.personalDay !== null ? `Personal Day ${ctx.personalDay} · ` : ""}
            {ctx.features.dayOfMonthOdd ? "Odd" : "Even"} calendar day
          </div>
        </div>
        <div className="hero-body">
          <div className="label">Today&rsquo;s Reasoning</div>
          {triggered.length > 0 ? (
            <div className="chip-row" style={{ marginBottom: 4 }}>
              {triggered.map((r) => (
                <span className="chip" key={r.id}>
                  <span className="dot" style={{ background: "var(--violet)" }} />
                  {r.rule}
                </span>
              ))}
            </div>
          ) : (
            <p>
              {ctx.personalDay === null
                ? 'Set BIRTH_DATE in .env.local to unlock numerology-based reasoning here.'
                : "No rules triggered today by your current Core Rules — add more in Notion for finer-grained guidance."}
            </p>
          )}
          {triggered.length > 0 && (
            <p>
              {triggered.map((r) => r.guidance).join(" ")}
            </p>
          )}
        </div>
      </section>

      {!ctx.connected && <ConnectPrompt />}

      {ctx.connected && notifications.length > 0 && (
        <section className="card" style={{ marginBottom: 16, padding: "10px 16px" }}>
          <div style={{ fontSize: 10.5, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
            🔔 Notifications
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {notifications.map((n, i) => (
              <span
                key={i}
                className={n.tone === "critical" ? "badge overdue" : n.tone === "warn" ? "badge med" : "badge pending"}
              >
                {n.text}
              </span>
            ))}
          </div>
        </section>
      )}

      {ctx.connected && (
        <>
          {/* Stat tiles */}
          <section className="stat-grid">
            <div className="card stat-tile">
              <span className="stat-label">Active Projects</span>
              <div className="stat-value">{activeProjects.length}</div>
              <div className="stat-delta flat">Across {ctx.companies.length} companies</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Tasks Due Today</span>
              <div className="stat-value">{ctx.tasksDueToday.length}</div>
              <div className="stat-delta flat">From Notion Tasks</div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Overdue Payments</span>
              <div className="stat-value">{overdue.length}</div>
              <div className="stat-delta down">
                {overdue[0] ? `${formatMoney(overdue[0].amount)}${overdue[0].dueDate ? ` · due ${overdue[0].dueDate}` : ""}` : "None"}
              </div>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Recent Energy</span>
              <div className="stat-value">{ctx.recentLogs[0]?.energyLevel ?? "—"}</div>
              <div className="stat-delta flat">
                {ctx.recentLogs.length ? `From ${ctx.recentLogs[0].date}` : "Log a daily entry to populate this"}
              </div>
            </div>
          </section>

          <section className="grid-2">
            <div className="card section-card">
              <h2>Today&rsquo;s Plan</h2>
              <div className="section-sub">Generated from your Core Rules + numerology</div>
              {triggered.length === 0 && (
                <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>
                  No specific do/avoid guidance triggered today. Add more Core Rules in Notion to sharpen this.
                </div>
              )}
              {triggered.map((r) => (
                <div className="plan-item" key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <div className={`plan-icon ${r.guidance.toLowerCase().includes("avoid") ? "warn" : "good"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <div className="plan-text">
                    <div className="title">{r.rule}</div>
                    <div className="reason">{r.guidance}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="side-stack">
              <div className="card section-card">
                <h2>Render Queue</h2>
                <div className="section-sub">Rendering-ready, by priority</div>
                <table className="mini">
                  <tbody>
                    <tr>
                      <th>Project</th>
                      <th>Priority</th>
                      <th>Due</th>
                    </tr>
                    {renderQueue.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ color: "var(--ink-muted)" }}>Nothing rendering-ready right now.</td>
                      </tr>
                    )}
                    {renderQueue.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="proj-name">{p.name}</div>
                        </td>
                        <td>
                          <span className={priorityBadgeClass[p.renderPriority ?? "Low"]}>{p.renderPriority ?? "—"}</span>
                        </td>
                        <td>{p.deadline ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card section-card">
                <h2>Payments</h2>
                <div className="section-sub">Overdue &amp; upcoming</div>
                <table className="mini">
                  <tbody>
                    <tr>
                      <th>Client</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                    {payments.filter((p) => p.status !== "Paid").length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ color: "var(--ink-muted)" }}>Nothing outstanding.</td>
                      </tr>
                    )}
                    {payments
                      .filter((p) => p.status !== "Paid")
                      .map((p) => (
                        <tr key={p.id}>
                          <td>{clientById(p.clientId)?.name ?? "—"}</td>
                          <td>{formatMoney(p.amount)}</td>
                          <td>
                            <span className={paymentBadgeClass[p.status]}>
                              {p.status === "Pending" && p.dueDate ? `Due ${p.dueDate}` : p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid-3">
            <div className="card section-card">
              <h2>Ideas Inbox</h2>
              <div className="section-sub">Quick capture — writes to Notion</div>
              <IdeaCapture />
              <div>
                {ideas.slice(0, 6).map((idea) => (
                  <span className="idea-tag" key={idea.id}>{idea.idea}</span>
                ))}
              </div>
            </div>

            <div className="card section-card">
              <h2>Learning</h2>
              <div className="section-sub">In progress</div>
              {learningTopics.filter((t) => t.progress === "In Progress").length === 0 && (
                <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Nothing in progress — add a topic in Notion.</div>
              )}
              {learningTopics
                .filter((t) => t.progress === "In Progress")
                .slice(0, 2)
                .map((topic) => (
                  <div className="learn-topic" key={topic.id}>
                    <div className="learn-swatch">✦</div>
                    <div>
                      <div className="title">{topic.topic}</div>
                      <div className="meta">{topic.sessionNotes || "In progress"}</div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="card section-card">
              <h2>Finance Goals</h2>
              <div className="section-sub">Progress toward targets</div>
              {financeGoals.length === 0 && (
                <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>No goals yet — add one in Notion.</div>
              )}
              {financeGoals.map((goal) => (
                <div className="goal-row" key={goal.id}>
                  <div className="goal-top">
                    <span className="name">{goal.goal}</span>
                    <span className="amt">
                      {formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}
                    </span>
                  </div>
                  <div className="track">
                    <div style={{ width: `${Math.min(100, Math.round((goal.currentAmount / (goal.targetAmount || 1)) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 16 }}>
            <DayPlanCard />
          </section>
        </>
      )}

      <div className="footnote">
        Orex OS — Today · {ctx.connected ? "live data from Notion" : "connect Notion to see live data"}
      </div>
    </>
  );
}
