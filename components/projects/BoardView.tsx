"use client";

import type { ClientRecord, Company, Project, TeamMember } from "@/lib/types";
import { NewProjectButton } from "@/components/ProjectForm";
import { STATUSES } from "./ProjectTree";

const statusBadge: Record<string, string> = {
  Idea: "badge pending",
  Planning: "badge pending",
  Production: "badge med",
  "Rendering-Ready": "badge high",
  Delivered: "badge low",
};

/** Days from today to an ISO date. Negative = in the past. */
function daysUntil(iso: string | undefined, todayISO: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso}T12:00:00Z`);
  const b = Date.parse(`${todayISO}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

function DaysChip({ days }: { days: number }) {
  if (days < 0) return <span className="pw-days late">{Math.abs(days)}d over</span>;
  if (days === 0) return <span className="pw-days late">today</span>;
  return <span className="pw-days soon">{days}d left</span>;
}

export default function BoardView({
  rows,
  companies,
  clients,
  team,
  taskStats,
  todayISO,
  onStatus,
}: {
  rows: Project[];
  companies: Company[];
  clients: ClientRecord[];
  team: TeamMember[];
  taskStats: Map<string, { total: number; done: number }>;
  todayISO: string;
  onStatus: (p: Project, status: string) => void;
}) {
  const present = STATUSES.filter((s) => rows.some((p) => p.status === s));
  return (
    <div className="board-scroll">
      {present.map((status) => {
        const list = rows.filter((p) => p.status === status);
        return (
          <div className="board-col" key={status}>
            <div className="board-col-head">
              <div className="left">
                <span className={statusBadge[status] ?? "badge pending"}>{status}</span>
                <span className="count">{list.length}</span>
              </div>
              <NewProjectButton companies={companies} clients={clients} team={team} defaultStatus={status} compact label={`New in ${status}`} />
            </div>
            {list.length === 0 ? (
              <div className="board-empty">Nothing here</div>
            ) : (
              list.map((p) => {
                const stats = taskStats.get(p.id);
                const pct = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
                const d = daysUntil(p.deadline, todayISO);
                return (
                  <div className="board-card" key={p.id}>
                    <div className="meta-row">
                      <div className="name">{p.name}</div>
                      {d !== null && p.status !== "Delivered" && d <= 7 && <DaysChip days={d} />}
                    </div>
                    {p.headline && (
                      <div style={{ fontSize: 11, color: "var(--ink-muted)", lineHeight: 1.45 }}>{p.headline}</div>
                    )}
                    <div className="meta-row">
                      <div className="progress-cell" style={{ minWidth: 0, flex: 1 }}>
                        <span className="pct">{stats && stats.total ? `${pct}%` : "—"}</span>
                        <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                      </div>
                      <select
                        value={p.status}
                        onChange={(e) => onStatus(p, e.target.value)}
                        style={{
                          fontSize: 10.5, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 6,
                          padding: "2px 5px", background: "var(--surface-raised)", color: "var(--ink-secondary)",
                          fontFamily: "inherit",
                        }}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
