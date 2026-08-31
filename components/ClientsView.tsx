"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRecord, Company, Project, Payment } from "@/lib/types";
import { NewClientButton } from "@/components/ClientForm";
import { HealthPill, HealthSignals } from "@/components/entity/HealthPill";
import { buildClientView } from "@/lib/companyView";

const relationshipTagClass: Record<string, string> = {
  VIP: "tag vip",
  Active: "tag active",
  Lead: "tag lead",
  Past: "tag past",
};

const filters = ["All", "Active", "Leads", "Past", "VIP", "Overdue"] as const;
type Filter = (typeof filters)[number];

function formatMoney(n: number) {
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

/** "3 days ago" / "4 months ago" — how cold a relationship has gone. */
function ago(iso: string, todayISO: string): string {
  const days = Math.round(
    (new Date(`${todayISO}T00:00:00Z`).getTime() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : `${Math.round(days / 365)}y ago`;
}

function matchesFilter(client: ClientRecord, filter: Filter, overdueClientIds: Set<string>) {
  switch (filter) {
    case "All":
      return true;
    case "Active":
      return client.relationship === "Active";
    case "Leads":
      return client.relationship === "Lead";
    case "Past":
      return client.relationship === "Past";
    case "VIP":
      return client.relationship === "VIP";
    case "Overdue":
      return overdueClientIds.has(client.id);
  }
}

export default function ClientsView({
  clients,
  companies,
  projects,
  payments,
  todayISO,
}: {
  clients: ClientRecord[];
  companies: Company[];
  projects: Project[];
  payments: Payment[];
  /** Passed from the server. `new Date()` in a client component renders one
   *  date on the server and another in the browser, which React reports as a
   *  hydration mismatch and which silently breaks every date on the page. */
  todayISO: string;
}) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id);
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);

  const companyById = (id: string) => companies.find((c) => c.id === id);

  const overdueClientIds = useMemo(
    () => new Set(payments.filter((p) => p.status === "Overdue").map((p) => p.clientId)),
    [payments]
  );

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (!matchesFilter(c, activeFilter, overdueClientIds)) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [clients, activeFilter, search, overdueClientIds]);

  const selected = clients.find((c) => c.id === selectedId) ?? filteredClients[0];
  const selectedCompany = selected ? companyById(selected.companyId) : undefined;
  // The same derivation the company profile uses — see lib/companyView.ts.
  // The old version found a client's projects by walking their PAYMENTS, so a
  // project with a client set but nothing invoiced yet appeared nowhere, and
  // the panel said "No projects linked via payments yet" about a client who
  // had two live projects.
  const view = useMemo(
    () =>
      selected
        ? buildClientView({ client: selected, companies, projects, payments, todayISO, money: formatMoney })
        : null,
    [selected, companies, projects, payments, todayISO]
  );
  const selectedPayments = view?.payments ?? [];
  const selectedProjects = view?.projects ?? [];

  const timeline = [...selectedPayments]
    .sort((a, b) => (b.paidDate ?? b.dueDate ?? "").localeCompare(a.paidDate ?? a.dueDate ?? ""))
    .map((p) => ({
      id: p.id,
      title: p.status === "Paid" ? `Paid: ${p.label}` : `${p.status}: ${p.label}`,
      meta: `${p.paidDate ?? p.dueDate ?? "no date"} · ${formatMoney(p.amount)}`,
      colorVar: p.status === "Paid" ? "--aqua" : p.status === "Overdue" ? "--critical" : "--blue",
    }));

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.relationship === "Active" || c.relationship === "VIP").length;
  const totalOutstanding = payments.filter((p) => p.status !== "Paid").reduce((sum, p) => sum + p.amount, 0);
  const overdueCount = overdueClientIds.size;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Client Management</div>
          <h1 className="brand-serif">Clients</h1>
        </div>
        <div className="topbar-actions">
          <NewClientButton companies={companies} />
        </div>
      </div>

      <section className="stat-grid">
        <div className="card stat-tile">
          <span className="stat-label">Total Clients</span>
          <div className="stat-value">{totalClients}</div>
          <div className="stat-delta flat">Across {companies.length} companies</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Active Clients</span>
          <div className="stat-value">{activeClients}</div>
          <div className="stat-delta flat">Active + VIP</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Outstanding Balance</span>
          <div className="stat-value">{formatMoney(totalOutstanding)}</div>
          <div className="stat-delta down">{overdueCount} overdue client(s)</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Avg. Client Value</span>
          <div className="stat-value">
            {formatMoney(totalClients ? Math.round(payments.reduce((s, p) => s + p.amount, 0) / totalClients) : 0)}
          </div>
          <div className="stat-delta flat">Lifetime billed / client</div>
        </div>
      </section>

      <div className="filter-row">
        <div className="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input type="text" placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {filters.map((f) => (
          <span key={f} className={`filter-chip${activeFilter === f ? " active" : ""}`} onClick={() => setActiveFilter(f)}>
            {f}
          </span>
        ))}
      </div>

      <section className="client-layout">
        <div className="card client-list">
          {filteredClients.length === 0 && (
            <div style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13 }}>No clients match this filter.</div>
          )}
          {filteredClients.map((client) => {
            const company = companyById(client.companyId);
            const isOverdue = overdueClientIds.has(client.id);
            return (
              <div
                key={client.id}
                className={`client-row${selected?.id === client.id ? " selected" : ""}`}
                onClick={() => {
                  setSelectedId(client.id);
                  setEditing(false);
                }}
              >
                <div className="client-avatar" style={{ background: client.avatarGradient }}>
                  {client.avatarInitial}
                </div>
                <div className="info">
                  <div className="row-name">
                    {client.name} <span className={relationshipTagClass[client.relationship]}>{client.relationship}</span>
                  </div>
                  <div className="row-meta">
                    <span className="company-dot" style={{ background: `var(${company?.colorVar ?? "--blue"})` }} />
                    {company ? (
                      <Link
                        href={`/companies/${company.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-link"
                        style={{ color: "inherit" }}
                      >
                        {company.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {isOverdue && (
                      <>
                        {" · "}
                        <span className="row-flag" />
                        Overdue
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div className={`card client-detail${editing ? " editing" : ""}`}>
            <div className="detail-header">
              <div className="detail-avatar" style={{ background: selected.avatarGradient }}>
                {selected.avatarInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div className="detail-title-row">
                  <h2>{selected.name}</h2>
                  <span className={relationshipTagClass[selected.relationship]}>{selected.relationship}</span>
                </div>
                <div className="detail-sub">
                  <span>
                    <span className="company-dot" style={{ background: `var(${selectedCompany?.colorVar ?? "--blue"})` }} />
                    {selectedCompany ? (
                      <Link href={`/companies/${selectedCompany.id}`} className="link-btn">
                        {selectedCompany.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  {selected.country && <span>🌍 {selected.country}</span>}
                  {selected.preferredContact && <span>Prefers: {selected.preferredContact}</span>}
                </div>
              </div>
              <div className="detail-actions">
                {selected.email && (
                  <a className="icon-btn" href={`mailto:${selected.email}`} title="Email">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 6-10 7L2 6" />
                    </svg>
                  </a>
                )}
                <button className="btn-ghost" onClick={() => setEditing((e) => !e)}>
                  {editing ? "✓ Editing (edit in Notion for now)" : "✎ Edit Client"}
                </button>
              </div>
            </div>

            <div className="fact-grid">
              <div>
                <div className="fact-label">Email</div>
                <div className="fact-value">{selected.email ?? "—"}</div>
              </div>
              <div>
                <div className="fact-label">Phone</div>
                <div className="fact-value">{selected.phone ?? "—"}</div>
              </div>
              <div>
                <div className="fact-label">Country</div>
                <div className="fact-value">{selected.country ?? "—"}</div>
              </div>
              <div>
                <div className="fact-label">Preferred Contact</div>
                <div className="fact-value">{selected.preferredContact ?? "—"}</div>
              </div>
            </div>

            {/* A tab bar with one tab in it is chrome for nothing. What the
                panel was missing was not navigation but a verdict: whether
                this relationship is fine, and why. */}
            {view && (
              <>
                <div className="cl-verdict">
                  <HealthPill health={view.health} />
                  {view.lastActivity && (
                    <span className="cl-last">
                      Last activity {ago(view.lastActivity.date, todayISO)} · {view.lastActivity.label}
                    </span>
                  )}
                </div>

                <dl className="cl-money">
                  <div>
                    <dt>Billed</dt>
                    <dd>{formatMoney(view.money.invoiced)}</dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd className="good">{formatMoney(view.money.paid)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className={view.money.outstanding > 0 ? "bad" : undefined}>
                      {formatMoney(view.money.outstanding)}
                    </dd>
                  </div>
                  <div>
                    <dt>Overdue</dt>
                    <dd className={view.money.overdue > 0 ? "bad" : undefined}>{formatMoney(view.money.overdue)}</dd>
                  </div>
                  <div>
                    <dt>Not invoiced</dt>
                    <dd className={view.money.uninvoiced > 0 ? "warn" : undefined}>
                      {formatMoney(view.money.uninvoiced)}
                    </dd>
                  </div>
                  <div>
                    <dt>Projects</dt>
                    <dd>
                      {view.liveProjects.length} live · {view.projects.length} all time
                    </dd>
                  </div>
                </dl>

                <div className="subsection">
                  <div className="subsection-title">What needs attention</div>
                  <HealthSignals health={view.health} />
                </div>
              </>
            )}

            {selected.notes && (
              <div className="subsection">
                <div className="subsection-title">Relationship notes</div>
                <p className="cl-notes">{selected.notes}</p>
              </div>
            )}

            <div className="subsection">
              <div className="subsection-title">Projects</div>
              <table className="mini stacks">
                <tbody>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Deadline</th>
                    <th className="num">Value</th>
                  </tr>
                  {selectedProjects.length === 0 && (
                    <tr>
                      <td colSpan={4} className="fin-empty">No projects for this client yet.</td>
                    </tr>
                  )}
                  {selectedProjects.map((p) => {
                    const late = p.status !== "Delivered" && p.deadline && p.deadline < todayISO;
                    return (
                      <tr key={p.id}>
                        <td data-label="Project">
                          <div className="proj-name">{p.name}</div>
                        </td>
                        <td data-label="Status">
                          <span className={`badge ${p.status === "Delivered" ? "paid" : "med"}`}>{p.status}</span>
                        </td>
                        <td data-label="Deadline" className={late ? "cp-late" : undefined}>
                          {dateLabel(p.deadline)}
                          {late && " · late"}
                        </td>
                        <td data-label="Value" className="num money">{p.value ? formatMoney(p.value) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="subsection">
              <div className="subsection-title">Payment History</div>
              <table className="mini stacks">
                <tbody>
                  <tr>
                    <th>Invoice</th>
                    <th>Due</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                  {selectedPayments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="fin-empty">No payments recorded yet.</td>
                    </tr>
                  )}
                  {selectedPayments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Invoice">{p.label}</td>
                      <td data-label="Due">{dateLabel(p.dueDate)}</td>
                      <td data-label="Amount" className="num money">{formatMoney(p.amount)}</td>
                      <td data-label="Status">
                        <span
                          className={
                            p.status === "Overdue" ? "badge overdue" : p.status === "Paid" ? "badge paid" : "badge pending"
                          }
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="subsection" style={{ marginBottom: 0 }}>
              <div className="subsection-title">Recent Activity</div>
              <div className="timeline">
                {timeline.length === 0 && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>No activity yet.</div>}
                {timeline.map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <div className="timeline-dot" style={{ background: `var(${event.colorVar})` }} />
                    <div className="timeline-body">
                      <div className="t-title">{event.title}</div>
                      <div className="t-meta">{event.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="footnote">Orex OS — Clients · live data from Notion</div>
    </>
  );
}
