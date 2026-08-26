import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompanies,
  getProjects,
  getClients,
  getPayments,
  getTeamMembers,
  getExpenses,
  getFinanceGoals,
  notionConnected,
} from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { EditCompanyButton } from "@/components/CompanyForm";
import { localMonthISO } from "@/lib/timezone";
import CompanyDetailTabs from "@/components/CompanyDetailTabs";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            <Link href="/companies" className="link-btn" style={{ padding: 0 }}>← Companies</Link>
          </div>
          <h1 className="brand-serif">Company Profile</h1>
        </div>
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <CompanyDetailBody id={id} />}
      <div className="footnote">Orex OS — Company Profile · live data from Notion</div>
    </>
  );
}

async function CompanyDetailBody({ id }: { id: string }) {
  const [companies, projects, clients, payments, team, expenses, goals] = await Promise.all([
    getCompanies(),
    getProjects(),
    getClients(),
    getPayments(),
    getTeamMembers(),
    getExpenses(),
    getFinanceGoals(),
  ]);

  const company = companies.find((c) => c.id === id);
  if (!company) notFound();

  const companyProjects = projects.filter((p) => p.companyId === id);
  const companyProjectIds = new Set(companyProjects.map((p) => p.id));
  const companyClients = clients.filter((c) => c.companyId === id);
  const companyClientIds = new Set(companyClients.map((c) => c.id));
  const companyPayments = payments.filter(
    (p) => (p.projectId && companyProjectIds.has(p.projectId)) || companyClientIds.has(p.clientId)
  );
  const companyTeam = team.filter((t) => t.companyId === id);
  const companyExpenses = expenses.filter((e) => e.companyId === id);
  const companyGoals = goals.filter((g) => g.linkedCompanyId === id);

  const thisMonth = localMonthISO();
  const monthRevenue = companyPayments
    .filter((p) => p.status === "Paid" && (p.paidDate || "").startsWith(thisMonth))
    .reduce((s, p) => s + p.amount, 0);
  const monthExpenses = companyExpenses
    .filter((e) => (e.date || "").startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);
  const activeProjects = companyProjects.filter((p) => p.status !== "Delivered").length;

  return (
    <div className="card client-detail">
      <div className="detail-header">
        <div className="detail-avatar" style={{ background: `linear-gradient(155deg, var(${company.colorVar}), #1c1c1a)` }}>
          {company.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div className="detail-title-row">
            <h2>{company.name}</h2>
            <span className="badge pending">{company.type}</span>
          </div>
          <div className="detail-sub">
            {company.startDate && <span>Since {company.startDate}</span>}
            <span>{activeProjects} active project{activeProjects === 1 ? "" : "s"}</span>
            <span>{companyTeam.length} team member{companyTeam.length === 1 ? "" : "s"}</span>
            <span>{companyClients.length} client{companyClients.length === 1 ? "" : "s"}</span>
          </div>
          {company.description && (
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 10, lineHeight: 1.55, maxWidth: 640 }}>
              {company.description}
            </p>
          )}
        </div>
        <div className="detail-actions">
          <EditCompanyButton company={company} />
        </div>
      </div>

      <div className="fact-grid">
        <div>
          <div className="fact-label">Revenue This Month</div>
          <div className="fact-value">${monthRevenue.toLocaleString()}</div>
        </div>
        <div>
          <div className="fact-label">Monthly Target</div>
          <div className="fact-value">
            {company.monthlyRevenueTarget !== undefined ? `$${company.monthlyRevenueTarget.toLocaleString()}` : "—"}
          </div>
        </div>
        <div>
          <div className="fact-label">Expenses This Month</div>
          <div className="fact-value">${monthExpenses.toLocaleString()}</div>
        </div>
        <div>
          <div className="fact-label">Net This Month</div>
          <div className="fact-value">${(monthRevenue - monthExpenses).toLocaleString()}</div>
        </div>
      </div>

      <CompanyDetailTabs
        company={company}
        companies={companies}
        projects={companyProjects}
        clients={companyClients}
        payments={companyPayments}
        team={companyTeam}
        expenses={companyExpenses}
        goals={companyGoals}
      />
    </div>
  );
}
