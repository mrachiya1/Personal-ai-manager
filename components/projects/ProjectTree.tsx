"use client";

import { useState } from "react";
import type { ProjectRow, ProjectSection } from "@/lib/projectsAnalytics";
import type { Task, TeamMember } from "@/lib/types";
import {
  DateCell,
  MultiPickCell,
  NumberCell,
  SelectCell,
  TextCell,
  type CellNav,
  type PickOption,
} from "./editable";
import { AvatarStack, avatarColor, initials } from "./cells";

export const STATUSES = ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"];
export const PRIORITIES = ["High", "Medium", "Low"];
export const TASK_STATUSES = ["Backlog", "In Progress", "Blocked", "Done"];

const statusBadge: Record<string, string> = {
  Idea: "badge pending",
  Planning: "badge pending",
  Production: "badge med",
  "Rendering-Ready": "badge high",
  Delivered: "badge low",
  Backlog: "badge pending",
  "In Progress": "badge med",
  Blocked: "badge overdue",
  Done: "badge paid",
};

const paymentBadge: Record<string, string> = {
  Paid: "badge paid",
  "Half done": "badge med",
  Pending: "badge pending",
  Overdue: "badge overdue",
  "Not invoiced": "badge low",
};

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function money(n: number | undefined, currency: string) {
  if (n === undefined) return undefined;
  const symbol = currency === "LKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${n.toLocaleString()}`;
}

export interface TreeHandlers {
  patch: (projectId: string, changes: Record<string, unknown>, body: Record<string, unknown>) => void;
  toggleTask: (task: Task) => void;
  patchTask: (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => void;
  openResources: (row: ProjectRow) => void;
  requestCompletion: (row: ProjectRow) => void;
}

/* ------------------------------------------------------------------ */
/* Sub-task checklist                                                  */
/* ------------------------------------------------------------------ */

function TaskList({
  row,
  handlers,
  baseRow,
}: {
  row: ProjectRow;
  handlers: TreeHandlers;
  baseRow: number;
}) {
  if (row.tasks.length === 0) {
    return (
      <div className="pt-detail">
        <div className="pt-empty">
          No sub-tasks yet. Add them in Notion against this project and the progress line fills itself.
        </div>
      </div>
    );
  }

  return (
    <div className="pt-detail">
      <div className="pt-detail-head">
        <span>Sub-tasks</span>
        <span className="pt-detail-count">
          {row.doneCount}/{row.taskCount} done
        </span>
      </div>
      <ul className="pt-tasks">
        {row.tasks.map((task, i) => (
          <li className={`pt-task${task.status === "Done" ? " done" : ""}`} key={task.id}>
            <button
              className={`pt-check${task.status === "Done" ? " on" : ""}`}
              onClick={() => handlers.toggleTask(task)}
              aria-pressed={task.status === "Done"}
              aria-label={`Mark ${task.title} ${task.status === "Done" ? "not done" : "done"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </button>
            <span className="pt-task-name">
              <TextCell
                value={task.title}
                onSave={(title) => handlers.patchTask(task, { title }, { title })}
                nav={{ row: baseRow, col: 100 + i * 3 }}
              />
            </span>
            <span className="pt-task-due">
              <DateCell
                value={task.dueDate}
                placeholder="No date"
                onSave={(dueDate) => handlers.patchTask(task, { dueDate }, { dueDate })}
                nav={{ row: baseRow, col: 101 + i * 3 }}
              />
            </span>
            <span className="pt-task-status">
              <SelectCell
                value={task.status}
                options={TASK_STATUSES}
                allowEmpty={false}
                heading="Task status"
                onSave={(status) => handlers.patchTask(task, { status: status as Task["status"] }, { status })}
                render={(v) => <span className={statusBadge[v] ?? "badge pending"}>{v}</span>}
                nav={{ row: baseRow, col: 102 + i * 3 }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One project row                                                     */
/* ------------------------------------------------------------------ */

function ProjectRowView({
  row,
  rowIndex,
  expanded,
  onToggle,
  handlers,
  clientOptions,
  categoryOptions,
  teamOptions,
  currency,
  personal,
}: {
  row: ProjectRow;
  rowIndex: number;
  expanded: boolean;
  onToggle: () => void;
  handlers: TreeHandlers;
  clientOptions: string[];
  categoryOptions: PickOption[];
  teamOptions: PickOption[];
  currency: string;
  personal: boolean;
}) {
  const p = row.project;
  const nav = (col: number): CellNav => ({ row: rowIndex, col });

  return (
    <>
      <tr className={`pt-row${expanded ? " open" : ""}${row.urgency === "late" ? " late" : ""}`}>
        {/* 0 — name */}
        <td className="pt-name-cell">
          <div className="pt-name">
            <button
              className={`pt-caret${expanded ? " open" : ""}`}
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${p.name}` : `Expand ${p.name}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            <button
              className={`pt-check${p.status === "Delivered" ? " on" : ""}`}
              onClick={() => handlers.requestCompletion(row)}
              aria-pressed={p.status === "Delivered"}
              aria-label={p.status === "Delivered" ? `Reopen ${p.name}` : `Mark ${p.name} delivered`}
              title={p.status === "Delivered" ? "Reopen this project" : "Mark delivered"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </button>
            <div className="pt-name-text">
              <TextCell
                value={p.name}
                bold
                onSave={(name) => handlers.patch(p.id, { name }, { name })}
                nav={nav(0)}
              />
              {p.headline && <span className="pt-headline">{p.headline}</span>}
            </div>
          </div>
        </td>

        {/* 1 — start */}
        <td>
          <DateCell
            value={p.startDate}
            placeholder="Start"
            onSave={(startDate) => handlers.patch(p.id, { startDate }, { startDate })}
            nav={nav(1)}
          />
        </td>

        {/* 2 — deadline */}
        <td>
          <DateCell
            value={p.deadline}
            placeholder="Deadline"
            tone={row.urgency}
            onSave={(deadline) => handlers.patch(p.id, { deadline }, { deadline })}
            nav={nav(2)}
          />
          {row.daysLeft !== null && row.urgency && (
            <span className={`pt-days ${row.urgency}`}>
              {row.daysLeft < 0 ? `${Math.abs(row.daysLeft)}d over` : row.daysLeft === 0 ? "today" : `${row.daysLeft}d`}
            </span>
          )}
        </td>

        {/* 3 — client, or purpose for personal work */}
        <td>
          {personal ? (
            <TextCell
              value={p.headline || ""}
              placeholder="What is it for?"
              onSave={(headline) => handlers.patch(p.id, { headline }, { headline })}
              nav={nav(3)}
            />
          ) : (
            <SelectCell
              value={row.client?.name}
              options={clientOptions}
              placeholder="Set client"
              heading="Client"
              onSave={(name) => handlers.patch(p.id, { clientName: name }, { clientName: name })}
              render={(name) => (
                <span className="pt-client">
                  <span className="company-dot" style={{ background: avatarColor(name) }} />
                  {name}
                </span>
              )}
              nav={nav(3)}
            />
          )}
        </td>

        {/* 4 — category */}
        <td>
          <MultiPickCell
            selected={p.category}
            options={categoryOptions}
            heading="Category"
            placeholder="Tag"
            onSave={(category) => handlers.patch(p.id, { category }, { category })}
            renderClosed={(chosen) => (
              <span className="pt-cats">
                <span className="type-pill">{chosen[0].label}</span>
                {chosen.length > 1 && <span className="cell-muted">+{chosen.length - 1}</span>}
              </span>
            )}
            nav={nav(4)}
          />
        </td>

        {/* 5 — assigned */}
        <td>
          <MultiPickCell
            selected={p.assignedTo}
            options={teamOptions}
            heading="Assign to"
            searchable
            placeholder="Assign"
            onSave={(assignedTo) => handlers.patch(p.id, { assignedTo }, { assignedTo })}
            renderClosed={(chosen) => <AvatarStack people={chosen} max={3} />}
            nav={nav(5)}
          />
        </td>

        {/* 6 — status */}
        <td>
          <SelectCell
            value={p.status}
            options={STATUSES}
            allowEmpty={false}
            heading="Status"
            onSave={(status) => {
              if (status === "Delivered" && p.status !== "Delivered") {
                handlers.requestCompletion(row);
                return;
              }
              handlers.patch(p.id, { status }, { status });
            }}
            render={(v) => <span className={statusBadge[v] ?? "badge pending"}>{v}</span>}
            nav={nav(6)}
          />
        </td>

        {/* 7 — last update (read-only: Notion owns it) */}
        <td className="pt-muted">{relativeTime(p.lastEditedTime)}</td>

        {/* 8 — next task */}
        <td>
          {row.nextTask ? (
            <TextCell
              value={row.nextTask.title}
              onSave={(title) => handlers.patchTask(row.nextTask!, { title }, { title })}
              nav={nav(8)}
            />
          ) : (
            <span className="pt-muted">No open task</span>
          )}
        </td>

        {/* 9 — priority */}
        <td>
          <SelectCell
            value={p.renderPriority}
            options={PRIORITIES}
            heading="Priority"
            onSave={(rp) => handlers.patch(p.id, { renderPriority: rp || undefined }, { renderPriority: rp })}
            render={(v) => <span className={`prio ${v.toLowerCase()}`}>{v}</span>}
            nav={nav(9)}
          />
        </td>

        {/* 10 — resources */}
        <td>
          <button className="pt-res" onClick={() => handlers.openResources(row)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            {p.files.length || "Add"}
          </button>
        </td>

        {/* 11 & 12 — budget and where the money is. Personal work has neither. */}
        {personal ? (
          <td className="pt-muted" colSpan={2}>
            Internal — no billing
          </td>
        ) : (
          <>
            <td>
              <NumberCell
                value={p.value}
                prefix={currency === "LKR" ? "Rs " : "$"}
                onSave={(v) => handlers.patch(p.id, { value: v }, { value: v ?? "" })}
                nav={nav(11)}
              />
            </td>
            <td>
              <span className={paymentBadge[row.payment.state] ?? "badge pending"} title={
                row.payment.invoiced
                  ? `${money(row.payment.paid, currency)} paid of ${money(row.payment.invoiced, currency)} invoiced`
                  : "No invoice raised against this project yet"
              }>
                {row.payment.state}
              </span>
            </td>
          </>
        )}
      </tr>

      {/* The progress line sits in its own zero-height row so it can span the
          whole table without fighting the cell padding above it. */}
      <tr className="pt-progress-row" aria-hidden>
        <td colSpan={13}>
          <div className="pt-progress" title={row.progress === null ? "No sub-tasks" : `${row.progress}% of sub-tasks done`}>
            <i
              className={row.urgency === "late" ? "late" : row.progress === 100 ? "done" : ""}
              style={{ width: `${row.progress ?? 0}%` }}
            />
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="pt-detail-row">
          <td colSpan={13}>
            <TaskList row={row} handlers={handlers} baseRow={rowIndex} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export default function ProjectTree({
  sections,
  handlers,
  clientOptions,
  categoryOptions,
  teamOptions,
  currency,
}: {
  sections: ProjectSection[];
  handlers: TreeHandlers;
  clientOptions: string[];
  categoryOptions: PickOption[];
  teamOptions: PickOption[];
  currency: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (sections.length === 0) {
    return (
      <div className="card section-card">
        <div className="empty-line" style={{ padding: 16 }}>
          Nothing matches. Clear the search, or add a project.
        </div>
      </div>
    );
  }

  let rowCursor = 0;

  return (
    <div className="pt-sections" data-cell-grid>
      {sections.map((section) => {
        const isOpen = !collapsed.has(section.key);
        const personal = section.kind === "personal";
        const value = section.rows.reduce((s, r) => s + (r.project.value || 0), 0);

        return (
          <section className={`card pt-section${personal ? " personal" : ""}`} key={section.key}>
            <header className="pt-section-head">
              <button
                className={`pt-caret big${isOpen ? " open" : ""}`}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.key)) next.delete(section.key);
                    else next.add(section.key);
                    return next;
                  })
                }
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${section.title}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              {section.colorVar && <span className="company-dot" style={{ background: `var(${section.colorVar})` }} />}
              <div className="pt-section-title">
                <h2>{section.title}</h2>
                <span className="pt-section-sub">{section.subtitle}</span>
              </div>
              {!personal && value > 0 && (
                <span className="pt-section-value">
                  {currency === "LKR" ? "Rs " : "$"}
                  {value.toLocaleString()}
                </span>
              )}
              <span className="count-chip">{section.rows.length}</span>
            </header>

            {isOpen && (
              <div className="pt-scroll">
                <table className="pt-table">
                  <colgroup>
                    <col style={{ width: 232 }} />
                    <col style={{ width: 104 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 132 }} />
                    <col style={{ width: 104 }} />
                    <col style={{ width: 88 }} />
                    <col style={{ width: 122 }} />
                    <col style={{ width: 84 }} />
                    <col style={{ width: 146 }} />
                    <col style={{ width: 92 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 106 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Start</th>
                      <th>Deadline</th>
                      <th>{personal ? "Purpose" : "Client"}</th>
                      <th>Category</th>
                      <th>Assigned</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Next task</th>
                      <th>Priority</th>
                      <th>Files</th>
                      <th colSpan={2}>{personal ? "Billing" : "Budget & payment"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => {
                      const rowIndex = rowCursor++;
                      return (
                        <ProjectRowView
                          key={row.project.id}
                          row={row}
                          rowIndex={rowIndex}
                          expanded={expanded.has(row.project.id)}
                          onToggle={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.project.id)) next.delete(row.project.id);
                              else next.add(row.project.id);
                              return next;
                            })
                          }
                          handlers={handlers}
                          clientOptions={clientOptions}
                          categoryOptions={categoryOptions}
                          teamOptions={teamOptions}
                          currency={currency}
                          personal={personal}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
