import Link from "next/link";
import { getCompanies, getProjects, getClients, getPayments, getTeamMembers, getTasks, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewCompanyButton, EditCompanyButton } from "@/components/CompanyForm";
import { HealthPill, HealthSignals } from "@/components/entity/HealthPill";
import { buildCompanyView, type CompanyView } from "@/lib/companyView";
import { localDateISO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Management</div>
          <h1 className="brand-serif">Companies</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewCompanyButton />
          </div>
        )}
      </div>

      {!(await notionConnected()) ? <ConnectPrompt /> : <CompaniesBody />}

      <div className="footnote">Orex OS — Companies · live data from Notion</div>
    </>
  );
}

function formatMoney(n: number) {
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

/**
 * A date that Notion might not have, or might have badly.
 *
 * "since -120" was on screen: a fixture had passed a number where a date
 * belonged, and the page printed it verbatim. Anything that is not a real
 * ISO date is not a date, and showing nothing is better than showing that.
 */
function sinceLabel(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const year = value.slice(0, 4);
  const month = new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `since ${month} ${year}`;
}

async function CompaniesBody() {
  const [companies, projects, clients, payments, team, tasks] = await Promise.all([
    getCompanies(),
    getProjects(),
    getClients(),
    getPayments(),
    getTeamMembers(),
    getTasks(),
  ]);
  const todayISO = localDateISO();

  if (companies.length === 0) {
    return (
      <div className="card section-card">
        <h2>No companies yet</h2>
        <p className="section-sub">
          A company is what projects, clients and revenue targets hang off. Click &ldquo;New Company&rdquo; above to add
          the first one.
        </p>
      </div>
    );
  }

  const views = companies
    .map((company) =>
      buildCompanyView({ company, projects, clients, team, tasks, payments, todayISO, money: formatMoney })
    )
    // Whatever needs attention first. A list sorted by name makes you read all
    // of it to find the one thing that is on fire.
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, neutral: 2, good: 3 } as const;
      return rank[a.health.verdict] - rank[b.health.verdict] || b.money.outstanding - a.money.outstanding;
    });

  /* ---------- the portfolio, before any single company ---------- */
  const totalTarget = companies.reduce((s, c) => s + (c.monthlyRevenueTarget || 0), 0);
  const totalRevenue = views.reduce((s, v) => s + v.money.revenueThisMonth, 0);
  const totalLive = views.reduce((s, v) => s + v.liveProjects.length, 0);
  const totalOutstanding = views.reduce((s, v) => s + v.money.outstanding, 0);
  const totalOverdue = views.reduce((s, v) => s + v.money.overdue, 0);
  const needsAttention = views.filter((v) => v.health.verdict === "critical");
  const monthPct = views[0]?.monthPct ?? 0;
  const targetPct = totalTarget > 0 ? (totalRevenue / totalTarget) * 100 : null;

  return (
    <>
      {/* The group before the parts. Three companies each showing their own
          revenue bar told you nothing about the operation as a whole — and the
          whole is what someone running three studios opens this page to see. */}
      <section className="portfolio">
        <div className="card pf-stat">
          <span className="fin-stat-label">Revenue this month</span>
          <div className="fin-stat-value">{formatMoney(totalRevenue)}</div>
          {totalTarget > 0 ? (
            <>
              <div className="pf-track" aria-hidden>
                <span className="pf-fill" style={{ width: `${Math.min(100, targetPct ?? 0)}%` }} />
                <span className="pf-pace" style={{ left: `${Math.min(100, monthPct)}%` }} />
              </div>
              <div className="fin-stat-foot">
                {(targetPct ?? 0).toFixed(0)}% of {formatMoney(totalTarget)} · {monthPct.toFixed(0)}% of the month gone
              </div>
            </>
          ) : (
            <div className="fin-stat-foot">No monthly targets set</div>
          )}
        </div>

        <div className="card pf-stat">
          <span className="fin-stat-label">Live projects</span>
          <div className="fin-stat-value">{totalLive}</div>
          <div className="fin-stat-foot">
            Across {companies.length} compan{companies.length === 1 ? "y" : "ies"} · {clients.length} client
            {clients.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="card pf-stat">
          <span className="fin-stat-label">Owed to you</span>
          <div className={`fin-stat-value${totalOverdue > 0 ? " bad" : ""}`}>{formatMoney(totalOutstanding)}</div>
          <div className="fin-stat-foot">
            {totalOverdue > 0 ? `${formatMoney(totalOverdue)} of it overdue` : "Nothing overdue"}
          </div>
        </div>

        <div className="card pf-stat">
          <span className="fin-stat-label">Needs attention</span>
          <div className={`fin-stat-value${needsAttention.length ? " bad" : " good"}`}>{needsAttention.length}</div>
          <div className="fin-stat-foot">
            {needsAttention.length
              ? needsAttention.map((v) => v.company.name).join(", ")
              : "Nothing past a deadline or overdue"}
          </div>
        </div>
      </section>

      <section className="co-grid">
        {views.map((v) => (
          <CompanyCard key={v.company.id} view={v} since={sinceLabel(v.company.startDate)} />
        ))}
      </section>
    </>
  );
}

function CompanyCard({ view, since }: { view: CompanyView; since: string | null }) {
  const c = view.company;
  const target = c.monthlyRevenueTarget;
  const pct = view.targetPct;

  return (
    <article className="card co-card">
      <header className="co-head">
        <span className="co-dot" style={{ background: `var(${c.colorVar})` }} aria-hidden />
        <div className="co-title">
          <h2>
            <Link href={`/companies/${c.id}`}>{c.name}</Link>
          </h2>
          <div className="co-sub">
            <span className="co-type">{c.type}</span>
            {since && <span>{since}</span>}
          </div>
        </div>
        <HealthPill health={view.health} size="sm" />
      </header>

      {c.description && <p className="co-desc">{c.description}</p>}

      {/* Four facts, one row, no boxes. Two big stat tiles for "Active
          Projects 2" and "Clients 2" spent half the card on two digits. */}
      <dl className="co-facts">
        <div>
          <dt>Live</dt>
          <dd>{view.liveProjects.length}</dd>
        </div>
        <div>
          <dt>Clients</dt>
          <dd>{view.clients.length}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{view.team.length}</dd>
        </div>
        <div>
          <dt>Owed</dt>
          <dd className={view.money.overdue ? "bad" : undefined}>{formatMoney(view.money.outstanding)}</dd>
        </div>
      </dl>

      {/* `target && ...` renders the NUMBER when target is 0 — React prints
          `0`, and a stray zero appeared under the facts row of every company
          without a revenue target. A ternary returns null instead. */}
      {target && target > 0 ? (
        <div className="co-target">
          <div className="co-target-top">
            <span>Revenue this month</span>
            <span className="co-target-amt">
              {formatMoney(view.money.revenueThisMonth)} <span className="of">of {formatMoney(target)}</span>
            </span>
          </div>
          {/* The marker is where the month is. A bar with no pace marker says
              "you are at 28%" and lets you assume that is fine on the 29th. */}
          <div className="pf-track" aria-hidden>
            <span
              className={`pf-fill${(pct ?? 0) >= view.monthPct ? " ahead" : " behind"}`}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
            <span className="pf-pace" style={{ left: `${Math.min(100, view.monthPct)}%` }} />
          </div>
        </div>
      ) : null}

      <HealthSignals health={view.health} limit={2} />

      <footer className="co-foot">
        <Link href={`/companies/${c.id}`} className="btn-save co-open">
          Open profile
        </Link>
        <EditCompanyButton company={c} />
      </footer>
    </article>
  );
}
