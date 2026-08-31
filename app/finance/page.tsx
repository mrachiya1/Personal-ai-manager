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
import { localDateISO } from "@/lib/timezone";
import { byCategory, groupByCurrency, movement, resolvePeriod, within } from "@/lib/financePeriod";
import PeriodChips from "@/components/finance/PeriodChips";
import MoneyStat from "@/components/finance/MoneyStat";

/**
 * A minus sign belongs in front of the symbol, not between them.
 *
 * `Rs -157,400` and `$-157,400` were both being printed. Every accounting
 * convention in use puts the sign outermost, and a stray one inside a figure
 * reads as a typo in the number rather than as a negative balance.
 */
function formatMoney(n: number, currency: string = "LKR") {
  const symbol = currency === "USD" ? "$" : "Rs ";
  const rounded = Math.round(n);
  return `${rounded < 0 ? "-" : ""}${symbol}${Math.abs(rounded).toLocaleString()}`;
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

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodKey } = await searchParams;
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
      {!(await notionConnected()) ? <ConnectPrompt /> : <FinanceBody periodKey={periodKey} />}
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

async function FinanceBody({ periodKey }: { periodKey?: string }) {
  const [goals, wishlist, expenses, income, accounts, projects] = await Promise.all([
    getFinanceGoals(),
    getWishlistItems(),
    getExpenses(),
    getIncome(),
    getAccounts(),
    getProjects(),
  ]);
  const companies = await getCompanies();
  const todayISO = localDateISO();
  const period = resolvePeriod(periodKey, todayISO);

  // Everything on this page is measured over ONE period, chosen by the
  // person. The old version put "This Month's Income" above tables listing
  // every record ever logged — two different spans of time on one screen,
  // neither of them selectable.
  const periodIncome = within(income, period.from, period.to);
  const periodExpenses = within(expenses, period.from, period.to);
  const incomeMove = movement(income, period);
  const expenseMove = movement(expenses, period);
  const net = incomeMove.total - expenseMove.total;
  const prevNet =
    incomeMove.previous !== null && expenseMove.previous !== null ? incomeMove.previous - expenseMove.previous : null;
  const netMove = {
    total: net,
    count: periodIncome.length + periodExpenses.length,
    previous: prevNet,
    changePct: prevNet === null || prevNet === 0 ? null : ((net - prevNet) / Math.abs(prevNet)) * 100,
  };

  const spendByCategory = byCategory(periodExpenses, "category");
  const recurringTotal = periodExpenses.filter((e) => e.recurring).reduce((s, e) => s + e.amount, 0);

  // Grouped by the currency each account is actually held in. Summing them
  // was printing a USD balance as though it were rupees — see
  // groupByCurrency() for why this shows two figures rather than one.
  const worth = groupByCurrency(accounts);

  const accountById = (id?: string) => accounts.find((a) => a.id === id);
  const projectById = (id?: string) => projects.find((p) => p.id === id);
  const companyById = (id?: string) => companies.find((c) => c.id === id);

  return (
    <>
      {/* The period governs the whole page, so it sits above everything the
          period applies to rather than inside one card. */}
      <PeriodChips current={period} />

      <section className="fin-hero">
        <div className="card fin-worth">
          <span className="fin-stat-label">Net worth</span>
          {worth.length === 0 ? (
            <div className="fin-worth-value">{formatMoney(0)}</div>
          ) : (
            <>
              <div className="fin-worth-value">{formatMoney(worth[0].total, worth[0].currency)}</div>
              {worth.slice(1).map((w) => (
                <div key={w.currency} className="fin-worth-alt">
                  + {formatMoney(w.total, w.currency)}
                </div>
              ))}
            </>
          )}
          <div className="fin-worth-foot">
            Across {accounts.length} account{accounts.length === 1 ? "" : "s"}
            {accounts.some((a) => a.type === "Credit Card") && " · card balances subtracted"}
            {worth.length > 1 && " · held in different currencies, not converted"}
          </div>
          <ul className="fin-worth-list">
            {/* Grouped by currency first, then by size WITHIN a currency.
                Sorting Rs 38,000 against $4,820 by raw magnitude compares two
                different units and puts them in a meaningless order. */}
            {[...accounts]
              .sort(
                (a, b) =>
                  (a.currency || "LKR").localeCompare(b.currency || "LKR") ||
                  Math.abs(b.balance) - Math.abs(a.balance)
              )
              .slice(0, 4)
              .map((a) => (
                <li key={a.id}>
                  <span className="fw-name">{a.name}</span>
                  <span className="fw-amount">{formatMoney(a.type === "Credit Card" ? -a.balance : a.balance, a.currency)}</span>
                </li>
              ))}
            {accounts.length === 0 && <li className="fw-empty">No accounts tracked yet.</li>}
          </ul>
        </div>

        <div className="fin-stats">
          <MoneyStat
            label="Money in"
            value={incomeMove.total}
            movement={incomeMove}
            period={period}
            format={formatMoney}
            intent="up-good"
            foot={`${incomeMove.count} entr${incomeMove.count === 1 ? "y" : "ies"} · ${period.label.toLowerCase()}`}
          />
          <MoneyStat
            label="Money out"
            value={expenseMove.total}
            movement={expenseMove}
            period={period}
            format={formatMoney}
            intent="up-bad"
            foot={
              recurringTotal
                ? `${formatMoney(recurringTotal)} of it recurring`
                : `${expenseMove.count} entr${expenseMove.count === 1 ? "y" : "ies"}`
            }
          />
          <MoneyStat
            label="Net"
            value={net}
            movement={netMove}
            period={period}
            format={formatMoney}
            intent="up-good"
            tone={net >= 0 ? "good" : "bad"}
            foot={net >= 0 ? "Kept, after everything out" : "Spending more than came in"}
          />
        </div>
      </section>

      {spendByCategory.length > 0 && (
        <section className="card fin-breakdown">
          <div className="fin-bd-head">
            <h2>Where it went</h2>
            <span className="section-sub">
              {period.label} · {formatMoney(expenseMove.total)} across {spendByCategory.length} categor
              {spendByCategory.length === 1 ? "y" : "ies"}
            </span>
          </div>
          <ul className="fin-bars">
            {spendByCategory.slice(0, 6).map((c) => (
              <li key={c.name}>
                <span className="fb-name">{c.name}</span>
                <span className="fb-track" aria-hidden>
                  <span className="fb-fill" style={{ width: `${Math.max(2, c.share)}%` }} />
                </span>
                <span className="fb-amount">{formatMoney(c.total)}</span>
                <span className="fb-share">{c.share.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* data-label on every cell is what turns these rows into cards on a
          phone. Without it `table.mini` fell back to a horizontal scroll, and
          on the Accounts table that put Balance, Updated and the Update button
          off the right edge with no visible way to reach them. */}
      <div className="card section-card fin-table-card">
        <div className="fin-card-head">
          <div>
            <h2>Accounts</h2>
            <div className="section-sub">Bank, investment, cash &amp; credit — balances as last updated</div>
          </div>
        </div>
        <table className="mini stacks">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Institution</th>
              <th className="num">Balance</th>
              <th>Updated</th>
              <th></th>
            </tr>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="fin-empty">
                  No accounts yet — click &ldquo;Add Account&rdquo; above to track a bank balance, investment, or credit card.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td data-label="Account">
                  <div className="proj-name">{a.name}</div>
                  {a.currency && <div className="proj-client">{a.currency}</div>}
                </td>
                <td data-label="Type"><span className={accountTypeBadge[a.type] ?? "badge pending"}>{a.type}</span></td>
                <td data-label="Institution">{a.institution || "—"}</td>
                <td data-label="Balance" className="num money">
                  {formatMoney(a.type === "Credit Card" ? -a.balance : a.balance, a.currency)}
                </td>
                <td data-label="Updated">{a.lastUpdated ?? "—"}</td>
                <td className="fin-row-action"><EditAccountButton account={a} /></td>
              </tr>
            ))}
            {accounts.length > 0 && (
              <tr className="fin-total">
                <td data-label="Total">Net worth</td>
                <td /><td />
                <td data-label="Balance" className="num money">
                  {worth.map((w) => formatMoney(w.total, w.currency)).join("  +  ")}
                </td>
                <td /><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card section-card fin-table-card">
        <div className="fin-card-head">
          <div>
            <h2>Money in</h2>
            <div className="section-sub">
              {period.label} · {incomeMove.count} entr{incomeMove.count === 1 ? "y" : "ies"}
              {income.length > incomeMove.count && ` · ${income.length} logged in total`}
            </div>
          </div>
          <span className="fin-card-total money">{formatMoney(incomeMove.total)}</span>
        </div>
        <table className="mini stacks">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th className="num">Amount</th>
              <th>Date</th>
              <th>Account</th>
            </tr>
            {periodIncome.length === 0 && (
              <tr>
                <td colSpan={5} className="fin-empty">
                  Nothing came in {period.label.toLowerCase()}.
                  {income.length > 0 && " Try a longer period above, or click “Log Income”."}
                </td>
              </tr>
            )}
            {periodIncome.slice(0, 25).map((i) => (
              <tr key={i.id}>
                <td data-label="Name">
                  <div className="proj-name">{i.name}</div>
                  {companyById(i.companyId) && (
                    <Link href={`/companies/${i.companyId}`} className="proj-client inline-link">
                      {companyById(i.companyId)?.name}
                    </Link>
                  )}
                </td>
                <td data-label="Source"><span className={sourceBadge[i.source] ?? "badge pending"}>{i.source}</span></td>
                <td data-label="Amount" className="num money">{formatMoney(i.amount, i.currency)}</td>
                <td data-label="Date">{i.date ?? "—"}</td>
                <td data-label="Account">{accountById(i.accountId)?.name ?? "—"}</td>
              </tr>
            ))}
            {periodIncome.length > 25 && (
              <tr>
                <td colSpan={5} className="fin-more">
                  Showing the first 25 of {periodIncome.length}. Narrow the period to see the rest.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card section-card fin-table-card">
        <div className="fin-card-head">
          <div>
            <h2>Money out</h2>
            <div className="section-sub">
              {period.label} · {expenseMove.count} entr{expenseMove.count === 1 ? "y" : "ies"}
              {recurringTotal > 0 && ` · ${formatMoney(recurringTotal)} recurring`}
            </div>
          </div>
          <span className="fin-card-total money">{formatMoney(expenseMove.total)}</span>
        </div>
        <table className="mini stacks">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th className="num">Amount</th>
              <th>Date</th>
              <th>Account</th>
              <th>Recurring</th>
              <th></th>
            </tr>
            {periodExpenses.length === 0 && (
              <tr>
                <td colSpan={7} className="fin-empty">
                  Nothing went out {period.label.toLowerCase()}.
                  {expenses.length > 0 && " Try a longer period above, or click “Log Expense”."}
                </td>
              </tr>
            )}
            {periodExpenses.slice(0, 25).map((e) => (
              <tr key={e.id}>
                <td data-label="Name">
                  <div className="proj-name">{e.name}</div>
                  {e.vendor && <div className="proj-client">{e.vendor}</div>}
                  {companyById(e.companyId) && (
                    <Link href={`/companies/${e.companyId}`} className="proj-client inline-link">
                      {companyById(e.companyId)?.name}
                    </Link>
                  )}
                </td>
                <td data-label="Category"><span className={categoryBadge[e.category] ?? "badge pending"}>{e.category}</span></td>
                <td data-label="Amount" className="num money">{formatMoney(e.amount, e.currency)}</td>
                <td data-label="Date">{e.date ?? "—"}</td>
                <td data-label="Account">{accountById(e.accountId)?.name ?? "—"}</td>
                <td data-label="Recurring">{e.recurring ? "Yes" : "—"}</td>
                <td className="fin-row-action"><EditExpenseButton expense={e} companies={companies} /></td>
              </tr>
            ))}
            {periodExpenses.length > 25 && (
              <tr>
                <td colSpan={7} className="fin-more">
                  Showing the first 25 of {periodExpenses.length}. Narrow the period to see the rest.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="grid-2">
      <div className="card section-card fin-table-card">
        <div className="fin-card-head">
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
              <div className="goal-meta">
                {accountById(goal.linkedAccountId) && <span>🏦 {accountById(goal.linkedAccountId)?.name}</span>}
                {projectById(goal.linkedProjectId) && <span>📁 {projectById(goal.linkedProjectId)?.name}</span>}
                <span>{projectMonthsToGoal(remaining, income, expenses)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card section-card fin-table-card">
        <div className="fin-card-head">
          <div>
            <h2>Wishlist</h2>
            <div className="section-sub">{wishlist.length} item{wishlist.length === 1 ? "" : "s"}</div>
          </div>
          <NewWishlistButton />
        </div>
        <table className="mini stacks">
          <tbody>
            <tr>
              <th>Item</th>
              <th className="num">Cost</th>
              <th>Priority</th>
            </tr>
            {wishlist.length === 0 && (
              <tr>
                <td colSpan={3} className="fin-empty">Nothing on the wishlist yet — click &ldquo;Add to Wishlist&rdquo; above.</td>
              </tr>
            )}
            {wishlist.map((item) => (
              <tr key={item.id}>
                <td data-label="Item">
                  <div className="proj-name">{item.item}</div>
                  {item.category && <div className="proj-client">{item.category}</div>}
                </td>
                <td data-label="Cost" className="num money">{item.estimatedCost ? formatMoney(item.estimatedCost) : "—"}</td>
                <td data-label="Priority">
                  <span className={priorityBadge[item.priority]}>{item.priority}</span>
                </td>
              </tr>
            ))}
            {wishlist.length > 0 && (
              <tr className="fin-total">
                <td data-label="Total">If you bought all of it</td>
                <td data-label="Cost" className="num money">
                  {formatMoney(wishlist.reduce((s2, i) => s2 + (i.estimatedCost || 0), 0))}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </section>
    </>
  );
}
