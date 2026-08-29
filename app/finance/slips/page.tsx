import Link from "next/link";
import { getAccounts, getCompanies, getExpenses, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import SlipInbox from "@/components/SlipInbox";
import AiInsights from "@/components/AiInsights";
import { localMonthISO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export const metadata = { title: "Slip Inbox · Orex OS" };

export default async function SlipsPage() {
  const connected = await notionConnected();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            <Link href="/finance" className="crumb-link">Finance</Link> · Slip Inbox
          </div>
          <h1 className="brand-serif">Slip Inbox</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/finance" className="btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-5 4 3 8-8" />
              <path d="M15 7h5v5" />
            </svg>
            Finance &amp; Goals
          </Link>
        </div>
      </div>

      {!connected ? <ConnectPrompt /> : <SlipsBody />}

      <div className="footnote">Orex OS — Slip Inbox · AI reads, you confirm, Notion stores</div>
    </>
  );
}

async function SlipsBody() {
  const [companies, accounts, expenses] = await Promise.all([getCompanies(), getAccounts(), getExpenses()]);
  const month = localMonthISO();
  const monthRows = expenses.filter((e) => (e.date || "").startsWith(month));
  const monthTotal = monthRows.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <section className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-label">Logged this month</span>
          <div className="stat-value">{monthRows.length}</div>
          <div className="stat-delta flat">expense records</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Month total</span>
          <div className="stat-value">{Math.round(monthTotal).toLocaleString()}</div>
          <div className="stat-delta flat">across all categories</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Companies</span>
          <div className="stat-value">{companies.length}</div>
          <div className="stat-delta flat">available to tag</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Accounts</span>
          <div className="stat-value">{accounts.length}</div>
          <div className="stat-delta flat">available to charge</div>
        </div>
      </section>

      <div className="section-title-row">
        <h2>Upload slips</h2>
      </div>

      <SlipInbox companies={companies} accounts={accounts} />

      <div className="section-title-row" style={{ marginTop: 22 }}>
        <h2>Spending read</h2>
      </div>
      <AiInsights
        scope="finance"
        title="Where the money went"
        sub="Reads this month's income, expenses, recurring charges, goals and unpaid invoices, and flags the ones worth acting on."
      />

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Recently logged</span>
          <span className="count-chip">{Math.min(expenses.length, 10)}</span>
        </div>
        {expenses.length === 0 ? (
          <div className="dt-empty">Nothing logged yet — drop your first slip above.</div>
        ) : (
          <div className="table-scroll">
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>Description</th>
                  <th style={{ width: "18%" }}>Vendor</th>
                  <th style={{ width: "16%" }}>Category</th>
                  <th style={{ width: "16%" }}>Date</th>
                  <th style={{ width: "16%" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td className="cell-name">{e.name}</td>
                    <td className="cell-muted">{e.vendor || "—"}</td>
                    <td><span className="type-pill">{e.category}</span></td>
                    <td className="cell-muted cell-nowrap">{e.date || "—"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--ink)" }}>
                      {e.currency === "USD" ? "$" : "Rs "}
                      {Math.round(e.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
