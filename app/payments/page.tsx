import Link from "next/link";
import { getPayments, getClients, getProjects, getCompanies, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewPaymentButton, EditPaymentButton, MarkPaidButton } from "@/components/PaymentForm";

const statusBadge: Record<string, string> = {
  Overdue: "badge overdue",
  Pending: "badge pending",
  "Partially Paid": "badge pending",
  Paid: "badge paid",
};

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
}

export default async function PaymentsPage() {
  const [clients, projects, companies] = await Promise.all([
    (await notionConnected()) ? getClients() : Promise.resolve([]),
    (await notionConnected()) ? getProjects() : Promise.resolve([]),
    (await notionConnected()) ? getCompanies() : Promise.resolve([]),
  ]);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Finance</div>
          <h1 className="brand-serif">Payments</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewPaymentButton clients={clients} companies={companies} projects={projects} />
          </div>
        )}
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <PaymentsBody clients={clients} projects={projects} companies={companies} />}
      <div className="footnote">Orex OS — Payments · live data from Notion · marking a payment Paid also logs it as Income</div>
    </>
  );
}

async function PaymentsBody({
  clients, projects, companies,
}: {
  clients: Awaited<ReturnType<typeof getClients>>;
  projects: Awaited<ReturnType<typeof getProjects>>;
  companies: Awaited<ReturnType<typeof getCompanies>>;
}) {
  const payments = await getPayments();
  const clientById = (id: string) => clients.find((c) => c.id === id);
  const companyById = (id?: string) => companies.find((c) => c.id === id);

  const overdue = payments.filter((p) => p.status === "Overdue");
  const upcoming = payments.filter((p) => p.status === "Pending" || p.status === "Partially Paid");
  const paid = payments.filter((p) => p.status === "Paid");

  const totalOutstanding = [...overdue, ...upcoming].reduce((s, p) => s + p.amount, 0);
  const totalPaid = paid.reduce((s, p) => s + p.amount, 0);

  const table = (title: string, rows: typeof payments) => (
    <div className="card section-card">
      <h2>{title}</h2>
      <div className="section-sub">{rows.length} payment(s)</div>
      <table className="mini">
        <tbody>
          <tr>
            <th>Client</th>
            <th>Label</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
            <th></th>
            <th></th>
          </tr>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: "var(--ink-muted)" }}>Nothing here.</td>
            </tr>
          )}
          {rows.map((p) => {
            const client = clientById(p.clientId);
            const company = companyById(client?.companyId);
            return (
              <tr key={p.id}>
                <td>
                  {client?.name ?? "—"}
                  {company && (
                    <div className="proj-client">
                      <Link href={`/companies/${company.id}`} className="link-btn" style={{ padding: 0, fontSize: 11 }}>
                        {company.name}
                      </Link>
                    </div>
                  )}
                </td>
                <td>
                  {p.label}
                  {p.linkedIncomeId && <div className="proj-client">💰 Logged as income</div>}
                </td>
                <td>{formatMoney(p.amount)}</td>
                <td>
                  <span className={statusBadge[p.status]}>{p.status}</span>
                </td>
                <td>{p.paidDate ?? p.dueDate ?? "—"}</td>
                <td><MarkPaidButton payment={p} /></td>
                <td><EditPaymentButton payment={p} clients={clients} companies={companies} projects={projects} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <section className="stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="card stat-tile">
          <span className="stat-label">Outstanding (overdue + upcoming)</span>
          <div className="stat-value">{formatMoney(totalOutstanding)}</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Paid to date</span>
          <div className="stat-value">{formatMoney(totalPaid)}</div>
        </div>
      </section>
      <section className="grid-2" style={{ gridTemplateColumns: "1fr" }}>
        {table("Overdue", overdue)}
        {table("Upcoming", upcoming)}
        {table("Paid History", paid)}
      </section>
    </>
  );
}
