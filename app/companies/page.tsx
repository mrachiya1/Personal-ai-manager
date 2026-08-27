import Link from "next/link";
import { getCompanies, getProjects, getClients, getPayments, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewCompanyButton, EditCompanyButton } from "@/components/CompanyForm";
import { localMonthISO } from "@/lib/timezone";

export default async function CompaniesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies</div>
          <h1 className="brand-serif">Companies</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewCompanyButton />
          </div>
        )}
      </div>

      {!(await notionConnected()) ? (
        <ConnectPrompt />
      ) : (
        <CompaniesBody />
      )}

      <div className="footnote">Orex OS — Companies · live data from Notion</div>
    </>
  );
}

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
}

async function CompaniesBody() {
  const [companies, projects, clients, payments] = await Promise.all([
    getCompanies(),
    getProjects(),
    getClients(),
    getPayments(),
  ]);

  const types = Array.from(new Set(companies.map((c) => c.type)));
  const grouped = types.length > 1;

  const card = (company: (typeof companies)[number]) => {
        const companyProjects = projects.filter((p) => p.companyId === company.id);
        const companyClients = clients.filter((c) => c.companyId === company.id);
        const active = companyProjects.filter((p) => p.status !== "Delivered").length;
        const thisMonth = localMonthISO();
        const companyProjectIds = new Set(companyProjects.map((p) => p.id));
        const monthRevenue = payments
          .filter(
            (p) =>
              p.status === "Paid" &&
              p.projectId &&
              companyProjectIds.has(p.projectId) &&
              (p.paidDate || "").startsWith(thisMonth)
          )
          .reduce((s, p) => s + p.amount, 0);
        return (
          <div className="card section-card" key={company.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span className="company-dot" style={{ background: `var(${company.colorVar})`, width: 10, height: 10 }} />
              <h2 style={{ margin: 0, flex: 1 }}>
                <Link href={`/companies/${company.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {company.name}
                </Link>
              </h2>
              <EditCompanyButton company={company} />
            </div>
            <div className="section-sub">{company.type}{company.startDate ? ` · since ${company.startDate}` : ""}</div>
            {company.description && <p style={{ fontSize: 13, color: "var(--ink-secondary)", lineHeight: 1.55 }}>{company.description}</p>}
            {company.goals && <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>{company.goals}</p>}
            <div className="stat-mini-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="stat-mini">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">{active}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Clients</div>
                <div className="stat-value">{companyClients.length}</div>
              </div>
            </div>
            {company.monthlyRevenueTarget !== undefined && (
              <div className="goal-row" style={{ marginTop: 4 }}>
                <div className="goal-top">
                  <span className="name">Revenue this month vs. target</span>
                  <span className="amt">{formatMoney(monthRevenue)} / {formatMoney(company.monthlyRevenueTarget)}</span>
                </div>
                <div className="track">
                  <div style={{ width: `${Math.min(100, Math.round((monthRevenue / (company.monthlyRevenueTarget || 1)) * 100))}%` }} />
                </div>
              </div>
            )}
            {company.plan && (
              <div className="subsection" style={{ marginTop: 14, marginBottom: 10 }}>
                <div className="subsection-title">Plan / To-Dos</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{company.plan}</div>
              </div>
            )}
            <Link href={`/companies/${company.id}`} className="link-btn">
              View full profile →
            </Link>
          </div>
        );
  };

  if (companies.length === 0) {
    return <div className="card section-card">No companies yet — click &ldquo;New Company&rdquo; above.</div>;
  }

  if (!grouped) {
    return <section className="grid-3">{companies.map(card)}</section>;
  }

  return (
    <>
      {types.map((type) => (
        <div key={type} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {type} · {companies.filter((c) => c.type === type).length}
          </div>
          <section className="grid-3">{companies.filter((c) => c.type === type).map(card)}</section>
        </div>
      ))}
    </>
  );
}
