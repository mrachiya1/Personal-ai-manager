import {
  getFinanceGoals,
  getWishlistItems,
  getExpenses,
  getIncome,
  getCompanies,
  getAccounts,
  getProjects,
  getPayments,
  notionConnected,
} from "@/lib/notion";
import Link from "next/link";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewExpenseButton, EditExpenseButton } from "@/components/ExpenseForm";
import { NewIncomeButton } from "@/components/IncomeForm";
import { NewAccountButton, EditAccountButton } from "@/components/AccountForm";
import { NewGoalButton } from "@/components/GoalForm";
import { NewWishlistButton } from "@/components/WishlistForm";
import { localMonthISO, localDateISO } from "@/lib/timezone";

function formatMoney(n: number, currency: string = "LKR") {
  const symbol = currency === "USD" ? "$" : "Rs ";
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

const priorityBadge: Record<string, string> = { High: "badge high", Medium: "badge med", Low: "badge low" };
const categoryBadge: Record<string, string> = {
  Subscription: "badge pending",
  Software: "badge pending",
  Fuel: "badge med",
  Salary: "badge high",
  Rent: "badge med",
  Donation: "badge low",
  Other: "badge low",
};
const sourceBadge: Record<string, string> = {
  "Client Payment": "badge paid",
  Salary: "badge high",
  Freelance: "badge med",
  Investment: "badge med",
  Gift: "badge low",
  "Donation Received": "badge low",
  Other: "badge pending",
};
const accountTypeBadge: Record<string, string> = {
  Bank: "badge low",
  Investment: "badge med",
  Cash: "badge pending",
  "Credit Card": "badge high",
  Other: "badge pending",
};

export default async function FinancePage() {
  const companies = (await notionConnected()) ? await getCompanies() : [];
  const accounts = (await notionConnected()) ? await getAccounts() : [];
  const payments = (await notionConnected()) ? await getPayments() : [];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Growth · Finance</div>
          <h1 className="brand-serif">Finance &amp; Goals</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewAccountButton />
            <NewIncomeButton companies={companies} accounts={accounts} payments={payments} />
            <NewExpenseButton companies={companies} accounts={accounts} />
          </div>
        )}
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <FinanceBody />}
      <div className="footnote">Orex OS — Finance &amp; Goals · live data from Notion</div>
    </>
  );
}

/** Naive "smart" projection: average monthly net (income - expenses) over the
 * last 3 calendar months that have any data, applied forward to the goal's
 * remaining amount. Clearly an estimate, not a forecast — shown as such. */
function projectMonthsToGoal(
  remaining: number,
  income: { amount: number; date?: string }[],
  expenses: { amount: number; date?: string }[]
): string {
  if (remaining <= 0) return "Target reached";
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthlyNet = months.map((m) => {
    const inc = income.filter((x) => (x.date || "").startsWith(m)).reduce((s, x) => s + x.amount, 0);
    const exp = expenses.filter((x) => (x.date || "").startsWith(m)).reduce((s, x) => s + x.amount, 0);
    return { month: m, net: inc - exp, hasData: inc > 0 || exp > 0 };
  });
  const withData = monthlyNet.filter((m) => m.hasData);
  if (withData.length === 0) return "Log a few months of income/expenses to enable a projection";
  const avgNet = withData.reduce((s, m) => s + m.net, 0) / withData.length;
  if (avgNet <= 0) return "Recent months show no net savings — projection unavailable";
  const monthsToGo = Math.ceil(remaining / avgNet);
  return `At your recent pace (~${formatMoney(avgNet)}/mo net), ~${monthsToGo} month${monthsToGo === 1 ? "" : "s"} to go`;
}

async function FinanceBody() {
  const [goals, wishlist, expenses, income, accounts, projects] = await Promise.all([
    getFinanceGoals(),
    getWishlistItems(),
    getExpenses(),
    getIncome(),
    getAccounts(),
    getProjects(),
  ]);
  const companies = await getCompanies();
  const thisMonth = localMonthISO();
  const monthExpenses = expenses.filter((e) => (e.date || "").startsWith(thisMonth));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const monthIncome = income.filter((i) => (i.date || "").startsWith(thisMonth));
  const monthIncomeTotal = monthIncome.reduce((s, i) => s + i.amount, 0);
  const recurringTotal = expenses
    .filter((e) => e.recurring && (e.date || "").startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const e of monthExpenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;

  // Week-to-date figures (Monday start), alongside the month-to-date ones above.
  const todayISO = localDateISO();
  const weekday = new Date(`${todayISO}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffsetDays = (weekday + 6) % 7;
  const monday = new Date(`${todayISO}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - mondayOffsetDays);
  const weekStartISO = monday.toISOString().slice(0, 10);
  const weekExpenseTotal = expenses.filter((e) => (e.date || "") >= weekStartISO).reduce((s, e) => s + e.amount, 0);
  const weekIncomeTotal = income.filter((i) => (i.date || "") >= weekStartISO).reduce((s, i) => s + i.amount, 0);
  const todayExpenseTotal = expenses.filter((e) => (e.date || "") === todayISO).reduce((s, e) => s + e.amount, 0);
  const todayIncomeTotal = income.filter((i) => (i.date || "") === todayISO).reduce((s, i) => s + i.amount, 0);

  const accountById = (id?: string) => accounts.find((a) => a.id === id);
  const projectById = (id?: string) => projects.find((p) => p.id === id);
  const companyById = (id?: string) => companies.find((c) => c.id === id);

  return (
    <>
      <section className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card stat-tile">
          <span className="stat-label">This Month&rsquo;s Income</span>
          <div className="stat-value">{formatMoney(monthIncomeTotal)}</div>
          <div className="stat-delta flat">
            {monthIncome.length} logged · {formatMoney(weekIncomeTotal)} this week · {formatMoney(todayIncomeTotal)} today
          </div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">This Month&rsquo;s Expenses</span>
          <div className="stat-value">{formatMoney(monthTotal)}</div>
          <div className="stat-delta flat">
            {monthExpenses.length} logged · {formatMoney(weekExpenseTotal)} this week · {formatMoney(todayExpenseTotal)} today
          </div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Net This Month</span>
          <div className={`stat-value`} style={{ color: monthIncomeTotal - monthTotal >= 0 ? undefined : "#a12424" }}>
            {formatMoney(monthIncomeTotal - monthTotal)}
          </div>
          <div className="stat-delta flat">Income − expenses</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Top Category</span>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}
          </div>
          <div className="stat-delta flat">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
              ? formatMoney(Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0][1])
              : "No expenses logged yet"}
          </div>
        </div>
      </section>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Accounts</h2>
            <div className="section-sub">
              Bank, investment, cash &amp; credit — {accounts.length} account(s) tracked
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Net Worth
            </div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {formatMoney(accounts.reduce((s, a) => s + (a.type === "Credit Card" ? -a.balance : a.balance), 0))}
            </div>
          </div>
        </div>
        <table className="mini">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Institution</th>
              <th>Balance</th>
              <th>Updated</th>
              <th></th>
            </tr>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-muted)" }}>
                  No accounts yet — click &ldquo;Add Account&rdquo; above to track a bank balance, investment, or credit card.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="proj-name">{a.name}</div>
                  {a.currency && <div className="proj-client">{a.currency}</div>}
                </td>
                <td><span className={accountTypeBadge[a.type] ?? "badge pending"}>{a.type}</span></td>
                <td>{a.institution || "—"}</td>
                <td>{formatMoney(a.balance, a.currency)}</td>
                <td>{a.lastUpdated ?? "—"}</td>
                <td><EditAccountButton account={a} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <h2>Income</h2>
        <div className="section-sub">Client payments, salary, freelance, gifts &amp; more — {income.length} logged total</div>
        <table className="mini">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Account</th>
            </tr>
            {income.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-muted)" }}>Nothing logged yet — click &ldquo;Log Income&rdquo; above.</td>
              </tr>
            )}
            {income.slice(0, 20).map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="proj-name">{i.name}</div>
                  {companyById(i.companyId) && (
                    <Link href={`/companies/${i.companyId}`} className="proj-client" style={{ display: "block" }}>
                      {companyById(i.companyId)?.name}
                    </Link>
                  )}
                </td>
                <td><span className={sourceBadge[i.source] ?? "badge pending"}>{i.source}</span></td>
                <td>{formatMoney(i.amount, i.currency)}</td>
                <td>{i.date ?? "—"}</td>
                <td>{accountById(i.accountId)?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <h2>Expenses</h2>
        <div className="section-sub">Subscriptions, software rental, fuel, salary, donations &amp; everything else — {expenses.length} logged total</div>
        <table className="mini">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Account</th>
              <th>Recurring</th>
              <th></th>
            </tr>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--ink-muted)" }}>Nothing logged yet — click &ldquo;Log Expense&rdquo; above, or snap a receipt photo.</td>
              </tr>
            )}
            {expenses.slice(0, 20).map((e) => (
              <tr key={e.id}>
                <td>
                  <div className="proj-name">{e.name}</div>
                  {e.vendor && <div className="proj-client">{e.vendor}</div>}
                  {companyById(e.companyId) && (
                    <Link href={`/companies/${e.companyId}`} className="proj-client" style={{ display: "block" }}>
                      {companyById(e.companyId)?.name}
                    </Link>
                  )}
                </td>
                <td><span className={categoryBadge[e.category] ?? "badge pending"}>{e.category}</span></td>
                <td>{formatMoney(e.amount, e.currency)}</td>
                <td>{e.date ?? "—"}</td>
                <td>{accountById(e.accountId)?.name ?? "—"}</td>
                <td>{e.recurring ? "Yes" : "—"}</td>
                <td><EditExpenseButton expense={e} companies={companies} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid-2">
      <div className="card section-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Goals</h2>
            <div className="section-sub">Personal + company targets</div>
          </div>
          <NewGoalButton companies={companies} accounts={accounts} projects={projects} />
        </div>
        {goals.length === 0 && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>No goals yet — click &ldquo;Add Goal&rdquo; above.</div>}
        {goals.map((goal) => {
          const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
          return (
            <div className="goal-row" key={goal.id}>
              <div className="goal-top">
                <span className="name">
                  {goal.goal} <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>({goal.type})</span>
                </span>
                <span className="amt">
                  {formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}
                  {goal.deadline ? ` · by ${goal.deadline}` : ""}
                </span>
              </div>
              <div className="track">
                <div style={{ width: `${Math.min(100, Math.round((goal.currentAmount / (goal.targetAmount || 1)) * 100))}%` }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {accountById(goal.linkedAccountId) && <span>🏦 {accountById(goal.linkedAccountId)?.name}</span>}
                {projectById(goal.linkedProjectId) && <span>📁 {projectById(goal.linkedProjectId)?.name}</span>}
                <span>{projectMonthsToGoal(remaining, income, expenses)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card section-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Wishlist</h2>
            <div className="section-sub">{wishlist.length} item(s)</div>
          </div>
          <NewWishlistButton />
        </div>
        <table className="mini">
          <tbody>
            <tr>
              <th>Item</th>
              <th>Cost</th>
              <th>Priority</th>
            </tr>
            {wishlist.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: "var(--ink-muted)" }}>Nothing on the wishlist yet — click &ldquo;Add to Wishlist&rdquo; above.</td>
              </tr>
            )}
            {wishlist.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="proj-name">{item.item}</div>
                  {item.category && <div className="proj-client">{item.category}</div>}
                </td>
                <td>{item.estimatedCost ? formatMoney(item.estimatedCost) : "—"}</td>
                <td>
                  <span className={priorityBadge[item.priority]}>{item.priority}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
    </>
  );
}
