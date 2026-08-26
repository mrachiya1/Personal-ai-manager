"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRecord, Company, Project, Payment } from "@/lib/types";
import { NewClientButton } from "@/components/ClientForm";

const relationshipTagClass: Record<string, string> = {
  VIP: "tag vip",
  Active: "tag active",
  Lead: "tag lead",
  Past: "tag past",
};

const filters = ["All", "Active", "Leads", "Past", "VIP", "Overdue"] as const;
type Filter = (typeof filters)[number];

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
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
}: {
  clients: ClientRecord[];
  companies: Company[];
  projects: Project[];
  payments: Payment[];
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
  const selectedPayments = selected ? payments.filter((p) => p.clientId === selected.id) : [];
  const selectedProjects = selected
    ? projects.filter((p) => selectedPayments.some((pay) => pay.projectId === p.id))
    : [];
  const totalBilled = selectedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = selectedPayments.filter((p) => p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);
  const outstanding = totalBilled - totalPaid;

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
                      <Link href={`/companies/${selectedCompany.id}`} className="link-btn" style={{ padding: 0 }}>
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

            <div className="detail-tabs">
              <div className="tab-btn active">Overview</div>
            </div>

            <div className="stat-mini-grid">
              <div className="stat-mini">
                <div className="stat-label">Total Billed</div>
                <div className="stat-value">{formatMoney(totalBilled)}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Total Paid</div>
                <div className="stat-value">{formatMoney(totalPaid)}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Outstanding</div>
                <div className="stat-value" style={{ color: outstanding > 0 ? "#a12424" : undefined }}>
                  {formatMoney(outstanding)}
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Lifetime Projects</div>
                <div className="stat-value">{selectedProjects.length}</div>
              </div>
            </div>

            {selected.notes && (
              <div className="subsection">
                <div className="subsection-title">Relationship Notes</div>
                <textarea className="editable" readOnly defaultValue={selected.notes} />
              </div>
            )}

            <div className="subsection">
              <div className="subsection-title">Linked Projects</div>
              <table className="mini">
                <tbody>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                  </tr>
                  {selectedProjects.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "var(--ink-muted)" }}>No projects linked via payments yet.</td>
                    </tr>
                  )}
                  {selectedProjects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="proj-name">{p.name}</div>
                      </td>
                      <td>
                        <span className={p.status === "Delivered" ? "badge low" : "badge high"}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="subsection">
              <div className="subsection-title">Payment History</div>
              <table className="mini">
                <tbody>
                  <tr>
                    <th>Invoice</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                  {selectedPayments.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ color: "var(--ink-muted)" }}>No payments recorded yet.</td>
                    </tr>
                  )}
                  {selectedPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>{formatMoney(p.amount)}</td>
                      <td>
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
