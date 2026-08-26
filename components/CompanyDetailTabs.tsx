"use client";

import { useState } from "react";
import type { Company, Project, ClientRecord, Payment, TeamMember, Expense, FinanceGoal } from "@/lib/types";
import { NewProjectButton, EditProjectButton } from "@/components/ProjectForm";
import { NewTeamMemberButton, EditTeamMemberButton } from "@/components/TeamForm";
import { NewExpenseButton } from "@/components/ExpenseForm";

const TABS = ["Overview", "Projects", "Goals", "Team", "Financials"] as const;
type Tab = (typeof TABS)[number];

const projectStatusBadge: Record<string, string> = {
  Idea: "badge pending",
  Planning: "badge pending",
  Production: "badge med",
  "Rendering-Ready": "badge high",
  Delivered: "badge low",
};

const paymentStatusBadge: Record<string, string> = {
  Overdue: "badge overdue",
  Pending: "badge pending",
  "Partially Paid": "badge pending",
  Paid: "badge paid",
};

const categoryBadge: Record<string, string> = {
  Subscription: "badge pending",
  Software: "badge pending",
  Fuel: "badge med",
  Salary: "badge high",
  Rent: "badge med",
  Other: "badge low",
};

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
}

export default function CompanyDetailTabs({
  company,
  companies,
  projects,
  clients,
  payments,
  team,
  expenses,
  goals,
}: {
  company: Company;
  companies: Company[];
  projects: Project[];
  clients: ClientRecord[];
  payments: Payment[];
  team: TeamMember[];
  expenses: Expense[];
  goals: FinanceGoal[];
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const planLines = (company.plan || "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <>
      <div className="detail-tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)} type="button">
            {t}
            {t === "Projects" && ` (${projects.length})`}
            {t === "Team" && ` (${team.length})`}
            {t === "Goals" && ` (${goals.length})`}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          {company.goals && (
            <div className="subsection">
              <div className="subsection-title">Goals</div>
              <p style={{ fontSize: 13, color: "var(--ink-secondary)", lineHeight: 1.6, margin: 0 }}>{company.goals}</p>
            </div>
          )}
          <div className="subsection">
            <div className="subsection-title">Plan / To-Dos</div>
            {planLines.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                No plan yet — click Edit above and add one item per line.
              </div>
            )}
            {planLines.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {planLines.map((line, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--ink-secondary)" }}>
                    <span style={{
                      width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--border-strong)",
                      marginTop: 1, flexShrink: 0, display: "inline-block",
                    }} />
                    <span>{line.replace(/^[-*•]\s*/, "")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="subsection" style={{ marginBottom: 0 }}>
            <div className="subsection-title">Snapshot</div>
            <div className="stat-mini-grid">
              <div className="stat-mini">
                <div className="stat-label">Projects</div>
                <div className="stat-value">{projects.length}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Clients</div>
                <div className="stat-value">{clients.length}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Team</div>
                <div className="stat-value">{team.length}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Open Goals</div>
                <div className="stat-value">{goals.length}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "Projects" && (
        <div className="subsection" style={{ marginBottom: 0 }}>
          <div className="subsection-title">
            Projects
            <NewProjectButton companies={companies} clients={clients} team={team} defaultCompanyId={company.id} />
          </div>
          <table className="mini">
            <tbody>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Priority</th>
                <th></th>
              </tr>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--ink-muted)" }}>No projects yet for {company.name}.</td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="proj-name">{p.name}</div>
                    {p.category?.length > 0 && <div className="proj-client">{p.category.join(", ")}</div>}
                  </td>
                  <td><span className={projectStatusBadge[p.status] ?? "badge pending"}>{p.status}</span></td>
                  <td>{p.deadline ?? "—"}</td>
                  <td>{p.renderPriority ?? "—"}</td>
                  <td><EditProjectButton project={p} companies={companies} clients={clients} team={team} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Goals" && (
        <div className="subsection" style={{ marginBottom: 0 }}>
          <div className="subsection-title">Goals linked to {company.name}</div>
          {goals.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              No goals linked yet — add one in Notion&rsquo;s Finance Goals database and set &ldquo;Linked Company&rdquo; to {company.name}.
            </div>
          )}
          {goals.map((goal) => (
            <div className="goal-row" key={goal.id}>
              <div className="goal-top">
                <span className="name">{goal.goal}</span>
                <span className="amt">
                  {formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}
                  {goal.deadline ? ` · by ${goal.deadline}` : ""}
                </span>
              </div>
              <div className="track">
                <div style={{ width: `${Math.min(100, Math.round((goal.currentAmount / (goal.targetAmount || 1)) * 100))}%` }} />
              </div>
            </div>
          ))}
          {company.monthlyRevenueTarget !== undefined && (
            <>
              <div className="subsection-title" style={{ marginTop: 20 }}>Monthly Revenue Target</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                Tracked automatically from paid Payments this calendar month — see the fact strip above.
              </div>
            </>
          )}
        </div>
      )}

      {tab === "Team" && (
        <div className="subsection" style={{ marginBottom: 0 }}>
          <div className="subsection-title">
            Team
            <NewTeamMemberButton companies={companies} defaultCompanyId={company.id} />
          </div>
          <table className="mini">
            <tbody>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
              {team.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--ink-muted)" }}>No team members assigned to {company.name} yet.</td>
                </tr>
              )}
              {team.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.role || "—"}</td>
                  <td>{t.email || "—"}</td>
                  <td><span className={t.status === "Active" ? "badge low" : "badge pending"}>{t.status}</span></td>
                  <td><EditTeamMemberButton member={t} companies={companies} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Financials" && (
        <>
          <div className="subsection">
            <div className="subsection-title">
              Expenses
              <NewExpenseButton companies={companies} defaultCompanyId={company.id} />
            </div>
            <table className="mini">
              <tbody>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--ink-muted)" }}>No expenses logged against {company.name} yet.</td>
                  </tr>
                )}
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td><span className={categoryBadge[e.category] ?? "badge pending"}>{e.category}</span></td>
                    <td>{formatMoney(e.amount)}</td>
                    <td>{e.date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="subsection" style={{ marginBottom: 0 }}>
            <div className="subsection-title">Payments</div>
            <table className="mini">
              <tbody>
                <tr>
                  <th>Label</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due / Paid</th>
                </tr>
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--ink-muted)" }}>No payments linked to {company.name} yet.</td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td>{formatMoney(p.amount)}</td>
                    <td><span className={paymentStatusBadge[p.status] ?? "badge pending"}>{p.status}</span></td>
                    <td>{p.paidDate ?? p.dueDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
