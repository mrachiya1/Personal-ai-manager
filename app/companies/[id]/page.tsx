import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompanies,
  getProjects,
  getClients,
  getPayments,
  getTeamMembers,
  getTasks,
  getExpenses,
  getFinanceGoals,
  notionConnected,
} from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { EditCompanyButton } from "@/components/CompanyForm";
import { HealthPill, HealthSignals } from "@/components/entity/HealthPill";
import { buildCompanyView } from "@/lib/companyView";
import { localDateISO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function money(n: number) {
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
}
function dateLabel(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      {!(await notionConnected()) ? (
        <>
          <div className="topbar">
            <div>
              <div className="eyebrow">
                <Link href="/companies" className="link-btn">
                  ← Companies
                </Link>
              </div>
              <h1 className="brand-serif">Company</h1>
            </div>
          </div>
          <ConnectPrompt />
        </>
      ) : (
        <CompanyDetailBody id={id} />
      )}
      <div className="footnote">Orex OS — Company profile · live data from Notion</div>
    </>
  );
}

async function CompanyDetailBody({ id }: { id: string }) {
  const [companies, projects, clients, payments, team, tasks, expenses, goals] = await Promise.all([
    getCompanies(),
    getProjects(),
    getClients(),
    getPayments(),
    getTeamMembers(),
    getTasks(),
    getExpenses(),
    getFinanceGoals(),
  ]);

  const company = companies.find((c) => c.id === id);
  if (!company) notFound();

  const todayISO = localDateISO();
  const view = buildCompanyView({ company, projects, clients, team, tasks, payments, todayISO, money });

  const thisMonth = todayISO.slice(0, 7);
  const companyExpenses = expenses.filter((e) => e.companyId === id);
  const monthExpenses = companyExpenses
    .filter((e) => (e.date || "").startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);
  const companyGoals = goals.filter((g) => g.linkedCompanyId === id);
  const net = view.money.revenueThisMonth - monthExpenses;
  const target = company.monthlyRevenueTarget;

  // Live work first, then whatever is closest to a deadline. A profile whose
  // project list is in database order makes you read all of it.
  const orderedProjects = [...view.projects].sort((a, b) => {
    const aLive = a.status === "Delivered" ? 1 : 0;
    const bLive = b.status === "Delivered" ? 1 : 0;
    if (aLive !== bLive) return aLive - bLive;
    return (a.deadline || "9999").localeCompare(b.deadline || "9999");
  });

  return (
    <>
      {/* One screen, not five tabs. The old Overview tab held two lines of text
          and four tiles repeating the header's own counts; everything that
          actually described the company was a click away, so nobody clicked. */}
      <div className="topbar cp-topbar">
        <div className="cp-crumb">
          <Link href="/companies" className="crumb-link">
            ← Companies
          </Link>
        </div>
      </div>

      <header className="card cp-head">
        <div
          className="cp-avatar"
          style={{ background: `linear-gradient(155deg, var(${company.colorVar}), var(--surface))` }}
          aria-hidden
        >
          {company.name.charAt(0).toUpperCase()}
        </div>
        <div className="cp-ident">
          <div className="cp-name-row">
            <h1>{company.name}</h1>
            <span className="badge pending">{company.type}</span>
            <HealthPill health={view.health} />
          </div>
          <div className="cp-meta">
            {company.startDate && /^\d{4}-\d{2}-\d{2}/.test(company.startDate) && (
              <span>Since {dateLabel(company.startDate)}</span>
            )}
            <span>
              {view.liveProjects.length} live of {view.projects.length} project
              {view.projects.length === 1 ? "" : "s"}
            </span>
            <span>
              {view.clients.length} client{view.clients.length === 1 ? "" : "s"}
            </span>
            <span>
              {view.team.length} on the team
            </span>
          </div>
          {company.description && <p className="cp-desc">{company.description}</p>}
        </div>
        <div className="cp-actions">
          <EditCompanyButton company={company} />
        </div>
      </header>

      {/* The money, this month, in one row — with the pace marker that makes a
          target mean something before the month has ended. */}
      <section className="cp-money">
        <div className="card cp-money-main">
          <span className="fin-stat-label">Revenue this month</span>
          <div className="fin-stat-value">{money(view.money.revenueThisMonth)}</div>
          {target && target > 0 ? (
            <>
              <div className="pf-track" aria-hidden>
                <span
                  className={`pf-fill${(view.targetPct ?? 0) >= view.monthPct ? " ahead" : " behind"}`}
                  style={{ width: `${Math.min(100, view.targetPct ?? 0)}%` }}
                />
                <span className="pf-pace" style={{ left: `${Math.min(100, view.monthPct)}%` }} />
              </div>
              <div className="fin-stat-foot">
                {(view.targetPct ?? 0).toFixed(0)}% of {money(target)} · {view.monthPct.toFixed(0)}% of the month gone
              </div>
            </>
          ) : (
            <div className="fin-stat-foot">No monthly target set for this company</div>
          )}
        </div>
        <dl className="card cp-money-side">
          <div>
            <dt>Expenses this month</dt>
            <dd>{money(monthExpenses)}</dd>
          </div>
          <div>
            <dt>Net this month</dt>
            <dd className={net >= 0 ? "good" : "bad"}>{money(net)}</dd>
          </div>
          <div>
            <dt>Outstanding</dt>
            <dd className={view.money.overdue ? "bad" : undefined}>{money(view.money.outstanding)}</dd>
          </div>
          <div>
            <dt>Overdue</dt>
            <dd className={view.money.overdue ? "bad" : undefined}>{money(view.money.overdue)}</dd>
          </div>
          <div>
            <dt>Invoiced all time</dt>
            <dd>{money(view.money.invoiced)}</dd>
          </div>
          <div>
            <dt>Not yet invoiced</dt>
            <dd className={view.money.uninvoiced ? "warn" : undefined}>{money(view.money.uninvoiced)}</dd>
          </div>
        </dl>
      </section>

      <section className="cp-grid">
        {/* ---------- what needs doing ---------- */}
        <div className="card cp-panel cp-wide">
          <div className="cp-panel-head">
            <h2>What needs attention</h2>
            <span className="section-sub">Every line traces to a record</span>
          </div>
          <HealthSignals health={view.health} />
        </div>

        {/* ---------- projects ---------- */}
        <div className="card cp-panel cp-wide">
          <div className="cp-panel-head">
            <h2>Projects</h2>
            <Link href="/projects" className="inline-link">
              Open the projects board →
            </Link>
          </div>
          {orderedProjects.length === 0 ? (
            <p className="cp-empty">No projects filed under this company yet.</p>
          ) : (
            <table className="mini stacks">
              <tbody>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th className="num">Value</th>
                </tr>
                {orderedProjects.map((p) => {
                  const overdue = p.status !== "Delivered" && p.deadline && p.deadline < todayISO;
                  return (
                    <tr key={p.id}>
                      <td data-label="Project">
                        <div className="proj-name">{p.name}</div>
                        {p.clientId && (
                          <div className="proj-client">
                            {clients.find((c) => c.id === p.clientId)?.name ?? "Internal"}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${p.status === "Delivered" ? "paid" : "med"}`}>{p.status}</span>
                      </td>
                      <td data-label="Deadline" className={overdue ? "cp-late" : undefined}>
                        {dateLabel(p.deadline)}
                        {overdue && " · late"}
                      </td>
                      <td data-label="Value" className="num money">
                        {p.value ? money(p.value) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ---------- clients ---------- */}
        <div className="card cp-panel">
          <div className="cp-panel-head">
            <h2>Clients</h2>
            <Link href="/clients" className="inline-link">
              All clients →
            </Link>
          </div>
          {view.clients.length === 0 ? (
            <p className="cp-empty">No clients under this company.</p>
          ) : (
            <ul className="cp-list">
              {view.clients.map((c) => {
                const theirs = view.projects.filter((p) => p.clientId === c.id);
                return (
                  <li key={c.id}>
                    <span className="cp-list-main">{c.name}</span>
                    <span className="cp-list-meta">
                      {theirs.length} project{theirs.length === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---------- team ---------- */}
        <div className="card cp-panel">
          <div className="cp-panel-head">
            <h2>Team</h2>
            <span className="section-sub">Assigned to this company&rsquo;s work</span>
          </div>
          {view.team.length === 0 ? (
            <p className="cp-empty">Nobody is assigned to a project here yet.</p>
          ) : (
            <ul className="cp-list">
              {view.team.map((m) => {
                const load = view.liveProjects.filter((p) => p.assignedTo.includes(m.id)).length;
                return (
                  <li key={m.id}>
                    <span className="cp-list-main">{m.name}</span>
                    <span className="cp-list-meta">
                      {load} live project{load === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---------- goals and plan ---------- */}
        <div className="card cp-panel">
          <div className="cp-panel-head">
            <h2>Goals &amp; plan</h2>
          </div>
          {company.goals && <p className="cp-note">{company.goals}</p>}
          {companyGoals.length > 0 && (
            <ul className="cp-goals">
              {companyGoals.map((g) => {
                const pct = Math.min(100, Math.round((g.currentAmount / (g.targetAmount || 1)) * 100));
                return (
                  <li key={g.id}>
                    <div className="cp-goal-top">
                      <span>{g.goal}</span>
                      <span className="cp-goal-amt">
                        {money(g.currentAmount)} <span className="of">of {money(g.targetAmount)}</span>
                      </span>
                    </div>
                    <div className="pf-track" aria-hidden>
                      <span className="pf-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {company.plan && (
            <>
              <div className="cp-sub-label">Plan / to-dos</div>
              <p className="cp-note pre">{company.plan}</p>
            </>
          )}
          {!company.goals && !company.plan && companyGoals.length === 0 && (
            <p className="cp-empty">No goals or plan recorded for this company.</p>
          )}
        </div>

        {/* ---------- money detail ---------- */}
        <div className="card cp-panel cp-wide">
          <div className="cp-panel-head">
            <h2>Invoices</h2>
            <Link href="/payments" className="inline-link">
              All payments →
            </Link>
          </div>
          {view.payments.length === 0 ? (
            <p className="cp-empty">Nothing invoiced against this company&rsquo;s projects.</p>
          ) : (
            <table className="mini stacks">
              <tbody>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                </tr>
                {[...view.payments]
                  .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""))
                  .slice(0, 10)
                  .map((p) => (
                    <tr key={p.id}>
                      <td data-label="Invoice">
                        <div className="proj-name">{p.label || "Invoice"}</div>
                        {p.projectId && (
                          <div className="proj-client">{projects.find((x) => x.id === p.projectId)?.name}</div>
                        )}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${
                            p.status === "Paid" ? "paid" : p.status === "Overdue" ? "overdue" : "pending"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td data-label="Due">{dateLabel(p.dueDate)}</td>
                      <td data-label="Amount" className="num money">
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
