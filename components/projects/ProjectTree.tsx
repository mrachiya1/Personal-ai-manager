"use client";

import { useState } from "react";
import type { ProjectRow, ProjectSection } from "@/lib/projectsAnalytics";
import type { Task, TeamMember } from "@/lib/types";
import {
  DateCell,
  Popover,
  navAttrs,
  MultiPickCell,
  NumberCell,
  SelectCell,
  TextCell,
  type CellNav,
  type PickOption,
} from "./editable";
import { avatarColor } from "./cells";
import AddPropertyButton from "./AddPropertyButton";
import Thumbnail, { categoryIcon } from "./Thumbnail";
import TaskRows, { type TaskRowHandlers } from "./TaskRows";

/**
 * Assignees as coloured dots.
 *
 * The column is 88px wide; two-letter initials at that size land under the
 * 10px legibility floor, so the dot carries identity by colour and the name
 * is on the title and the accessible label. Beyond three, a count — six
 * overlapping circles is not information.
 */
function AssignedDots({ people }: { people: { id: string; label: string }[] }) {
  if (people.length === 0) return <span className="pt-assign empty">Assign</span>;
  return (
    <span className="pt-assign" aria-label={`Assigned to ${people.map((p) => p.label).join(", ")}`}>
      {people.slice(0, 3).map((p) => (
        <span key={p.id} className="pt-dot" style={{ background: avatarColor(p.id) }} title={p.label} />
      ))}
      {people.length > 3 && <span className="pt-dot-more">+{people.length - 3}</span>}
    </span>
  );
}


/**
 * A badge tone for any status word, including ones this app has never seen.
 *
 * The status vocabulary belongs to the workspace's Notion database, not to
 * this file — one person's "Production" is another's "Active". Matching on
 * meaning rather than an exact string means a renamed status keeps its colour
 * instead of silently falling back to grey.
 */
export function statusBadge(value: string): string {
  const v = value.toLowerCase();
  if (/(done|delivered|complete|shipped|paid|live)/.test(v)) return "badge paid";
  if (/(block|stuck|hold|overdue|risk)/.test(v)) return "badge overdue";
  if (/(review|check|qa|approval|pending|render)/.test(v)) return "badge high";
  if (/(active|progress|production|building|doing)/.test(v)) return "badge med";
  return "badge pending"; // idea, backlog, planning — anything not started
}

/** MM/DD/YYYY, as the design specifies. */
function shortDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

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

export interface TreeOptions {
  /** User-added Notion columns, rendered after the built-in ones. */
  custom: import("@/lib/customProps").CustomProperty[];
  clientOptions: string[];
  categoryOptions: PickOption[];
  teamOptions: PickOption[];
  statusOptions: string[];
  priorityOptions: string[];
  currency: string;
}

export interface TreeHandlers {
  patch: (projectId: string, changes: Record<string, unknown>, body: Record<string, unknown>) => void;
  toggleTask: (task: Task) => void;
  patchTask: (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => void;
  openResources: (row: ProjectRow) => void;
  requestCompletion: (row: ProjectRow) => void;
  requestDelete: (row: ProjectRow) => void;
  addTask: TaskRowHandlers["addTask"];
  removeTask: TaskRowHandlers["removeTask"];
  /** Locally-stored previews, keyed by project or task page id. */
  thumbs: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Custom property cells                                               */
/* ------------------------------------------------------------------ */

/**
 * One user-added column.
 *
 * Each Notion type gets the editor that matches it rather than a text box for
 * everything — a checkbox you have to type "true" into is not an editor. The
 * types Notion computes (formula, rollup, created time) render read-only,
 * because writing to them is not a thing the API allows and a cell that looks
 * editable and silently fails is worse than one that plainly isn't.
 */
function CustomCell({
  prop,
  value,
  onSave,
  nav,
}: {
  prop: import("@/lib/customProps").CustomProperty;
  value: string | number | boolean | string[] | undefined;
  onSave: (v: string | number | boolean | string[] | undefined) => void;
  nav: CellNav;
}) {
  if (!prop.editable) {
    const shown = Array.isArray(value) ? value.join(", ") : value === undefined ? "—" : String(value);
    return <span className="pt-muted" title="Notion computes this — not editable here">{shown}</span>;
  }

  switch (prop.type) {
    case "number":
      return (
        <NumberCell
          value={typeof value === "number" ? value : undefined}
          onSave={(v) => onSave(v)}
          nav={nav}
        />
      );
    case "date":
      return (
        <DateCell
          value={typeof value === "string" ? value : undefined}
          format={shortDate}
          placeholder="—"
          onSave={(v) => onSave(v)}
          nav={nav}
        />
      );
    case "checkbox":
      return (
        <button
          className={`pt-check standalone${value ? " on" : ""}`}
          onClick={() => onSave(!value)}
          aria-pressed={Boolean(value)}
          aria-label={`${prop.name}: ${value ? "yes" : "no"}`}
          {...navAttrs(nav)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSave(!value); }
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </button>
      );
    case "select":
    case "status":
      return (
        <SelectCell
          value={typeof value === "string" ? value : undefined}
          options={prop.options ?? []}
          heading={prop.name}
          onSave={(v) => onSave(v)}
          render={(v) => <span className="type-pill">{v}</span>}
          nav={nav}
        />
      );
    case "multi_select":
      return (
        <MultiPickCell
          selected={Array.isArray(value) ? value : []}
          options={(prop.options ?? []).map((o) => ({ id: o, label: o }))}
          heading={prop.name}
          placeholder="—"
          onSave={(ids) => onSave(ids)}
          renderClosed={(chosen) => (
            <span className="pt-cats">
              <span className="type-pill">{chosen[0].label}</span>
              {chosen.length > 1 && <span className="cell-muted">+{chosen.length - 1}</span>}
            </span>
          )}
          nav={nav}
        />
      );
    case "url":
    case "email":
    case "phone_number": {
      const text = typeof value === "string" ? value : "";
      const href = prop.type === "url" ? text : prop.type === "email" ? `mailto:${text}` : `tel:${text}`;
      return (
        <span className="pt-linked">
          <TextCell value={text} onSave={(v) => onSave(v)} placeholder="—" nav={nav} />
          {text && (
            <a href={href} target="_blank" rel="noreferrer" className="pt-linked-go" aria-label={`Open ${text}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </span>
      );
    }
    case "people":
    case "files":
      // Both need a picker this table does not have — a Notion member list, or
      // an upload flow that already lives in the resources modal.
      return (
        <span className="pt-muted" title="Edit this one in Notion">
          {Array.isArray(value) && value.length ? value.join(", ") : "—"}
        </span>
      );
    default:
      return (
        <TextCell
          value={typeof value === "string" ? value : value === undefined ? "" : String(value)}
          onSave={(v) => onSave(v)}
          placeholder="—"
          nav={nav}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/* Row actions                                                         */
/* ------------------------------------------------------------------ */

/**
 * The per-row ··· menu.
 *
 * Kept out of the hover-only pattern the design suggests: a control that only
 * exists while the pointer is over the row is unreachable by keyboard and
 * invisible on touch, which is most of where this app is used. It is always
 * in the DOM and simply quiet until focused or hovered.
 */
function RowMenu({
  row,
  onDelete,
  onResources,
}: {
  row: ProjectRow;
  onDelete: () => void;
  onResources: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-menu-wrap">
      <button
        className={`pt-menu-btn${open ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${row.project.name}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <button className="ed-opt" onClick={() => { setOpen(false); onResources(); }}>
            Resources &amp; links
          </button>
          <button className="ed-opt danger" onClick={() => { setOpen(false); onDelete(); }}>
            Delete project…
          </button>
        </Popover>
      )}
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
  options,
  personal,
}: {
  row: ProjectRow;
  rowIndex: number;
  expanded: boolean;
  onToggle: () => void;
  handlers: TreeHandlers;
  options: TreeOptions;
  personal: boolean;
}) {
  const { clientOptions, categoryOptions, teamOptions, statusOptions, priorityOptions, currency } = options;
  const p = row.project;
  const nav = (col: number): CellNav => ({ row: rowIndex, col });
  // Eleven fixed columns, the user's custom ones, and the add-property cell.
  const columns = 12 + options.custom.length;

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
            <RowMenu row={row} onDelete={() => handlers.requestDelete(row)} onResources={() => handlers.openResources(row)} />
            <span className="pt-thumb">
              <Thumbnail
                pageId={p.id}
                name={p.name}
                src={handlers.thumbs[p.id] || p.files.find((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name))?.url}
                category={categoryIcon(p.category)}
                size={40}
              />
            </span>
            <div className="pt-name-text">
              <TextCell
                value={p.name}
                bold
                onSave={(name) => handlers.patch(p.id, { name }, { name })}
                nav={nav(0)}
              />
              <span className="pt-subline">
                {!personal && (
                  <SelectCell
                    value={row.client?.name}
                    options={clientOptions}
                    placeholder="No client"
                    heading="Client"
                    // The workspace resolves the name to its relation id; the
                    // table only ever knows names.
                    onSave={(clientName) => handlers.patch(p.id, {}, { clientName })}
                    render={(v) => (
                      <span className="pt-client">
                        {row.company?.colorVar && (
                          <span className="company-dot" style={{ background: `var(${row.company.colorVar})` }} />
                        )}
                        {v}
                      </span>
                    )}
                    nav={nav(1)}
                  />
                )}
                {/* Client or headline, not both. Two pieces of small text
                    sharing 200px means each gets 100 and neither is readable
                    — the client name is the one that identifies the row. */}
                {personal && p.headline && <span className="pt-headline">{p.headline}</span>}
              </span>
            </div>
          </div>
        </td>

        {/* 1 — start */}
        <td data-label="Start">
          <DateCell
            value={p.startDate}
            format={shortDate}
            placeholder="Start"
            onSave={(startDate) => handlers.patch(p.id, { startDate }, { startDate })}
            nav={nav(1)}
          />
        </td>

        {/* 2 — deadline */}
        <td data-label="Deadline">
          <DateCell
            value={p.deadline}
            format={shortDate}
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

        {/* 4 — category */}
        <td data-label="Category">
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
        <td data-label="Assigned">
          <MultiPickCell
            selected={p.assignedTo}
            options={teamOptions}
            heading="Assign to"
            searchable
            placeholder="Assign"
            onSave={(assignedTo) => handlers.patch(p.id, { assignedTo }, { assignedTo })}
            renderClosed={(chosen) => <AssignedDots people={chosen} />}
            nav={nav(5)}
          />
        </td>

        {/* 6 — status */}
        <td data-label="Status">
          <SelectCell
            value={p.status}
            options={statusOptions}
            allowEmpty={false}
            heading="Status"
            onSave={(status) => {
              if (status === "Delivered" && p.status !== "Delivered") {
                handlers.requestCompletion(row);
                return;
              }
              handlers.patch(p.id, { status }, { status });
            }}
            render={(v) => <span className={statusBadge(v)}>{v}</span>}
            nav={nav(6)}
          />
        </td>

        {/* 7 — last update (read-only: Notion owns it) */}
        <td className="pt-muted" data-label="Updated">{relativeTime(p.lastEditedTime)}</td>

        {/* 8 — next task */}
        <td data-label="Next task">
          {row.nextTask ? (
            <button
              className="pt-next"
              onClick={() => {
                if (!expanded) onToggle();
              }}
              title={`${row.nextTask.status} — open the sub-task list`}
            >
              <span className={`pt-next-dot ${row.nextTask.status === "In Progress" ? "on" : ""}`} aria-hidden />
              <span className="pt-next-title">{row.nextTask.title}</span>
            </button>
          ) : (
            <span className="pt-muted">No open task</span>
          )}
        </td>

        {/* 9 — priority */}
        <td data-label="Priority">
          <SelectCell
            value={p.renderPriority}
            options={priorityOptions}
            heading="Priority"
            onSave={(rp) => handlers.patch(p.id, { renderPriority: rp || undefined }, { renderPriority: rp })}
            render={(v) => <span className={`prio ${v.toLowerCase()}`}>{v}</span>}
            nav={nav(9)}
          />
        </td>

        {/* 10 — resources */}
        <td data-label="Files">
          {/* A link, as the reference has it. The bordered button was 96px of
              chrome in a 78px column, which is what pushed "Check here" into
              the budget figure beside it. */}
          <button className="pt-res" onClick={() => handlers.openResources(row)}>
            Check here
            {p.files.length > 0 && <span className="pt-res-count">{p.files.length}</span>}
          </button>
        </td>

        {/* Budget and payment in one cell: the figure with its settlement
            state under it. Two columns for one fact about money was 190px of
            a window that had none to give. */}
        {personal ? (
          <td className="pt-muted" data-label="Billing">
            Internal
          </td>
        ) : (
          <td data-label="Budget">
            <NumberCell
              value={p.value}
              prefix={currency === "LKR" ? "Rs " : "$"}
              onSave={(v) => handlers.patch(p.id, { value: v }, { value: v ?? "" })}
              nav={nav(11)}
            />
            <span
              className={`${paymentBadge[row.payment.state] ?? "badge pending"} pt-pay`}
              title={
                row.payment.invoiced
                  ? `${money(row.payment.paid, currency)} paid of ${money(row.payment.invoiced, currency)} invoiced`
                  : "No invoice raised against this project yet"
              }
            >
              {row.payment.state}
            </span>
          </td>
        )}

        {options.custom.map((prop, i) => (
          <td key={prop.name} className="td-custom" data-label={prop.name}>
            <CustomCell
              prop={prop}
              value={p.custom?.[prop.name]}
              nav={nav(13 + i)}
              onSave={(v) =>
                handlers.patch(
                  p.id,
                  { custom: { ...(p.custom ?? {}), [prop.name]: v } },
                  { custom: { [prop.name]: { type: prop.type, value: v } } }
                )
              }
            />
          </td>
        ))}
        {/* One empty cell under the + so the header and body stay aligned. */}
        <td className="pt-add-col" />
      </tr>

      {/* The progress line sits in its own zero-height row so it can span the
          whole table without fighting the cell padding above it. */}
      {/* Sub-tasks are rows of this table, not a panel inside one cell — so a
          task's deadline sits under the word "Deadline" rather than under it
          by coincidence. */}
      {expanded && (
        <TaskRows
          tree={row.tree}
          projectId={row.project.id}
          teamOptions={teamOptions}
          columns={columns}
          handlers={handlers}
          baseRow={rowIndex}
        />
      )}

      {/* The progress track closes the group: under the parent when collapsed,
          under the last sub-task when open, so it always reads as the bottom
          border of the thing it measures. */}
      <tr className={`pt-progress-row${expanded ? " open" : ""}`} aria-hidden>
        <td colSpan={columns}>
          <div
            className="pt-progress"
            title={
              row.progress === null
                ? "No sub-tasks"
                : `${row.progress}% — ${row.doneCount} of ${row.taskCount} sub-items done, counted at the deepest level`
            }
          >
            <i
              className={row.urgency === "late" ? "late" : row.progress === 100 ? "done" : ""}
              style={{ width: `${row.progress ?? 0}%` }}
            />
          </div>
        </td>
      </tr>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export default function ProjectTree({
  sections,
  handlers,
  options,
}: {
  sections: ProjectSection[];
  handlers: TreeHandlers;
  options: TreeOptions;
}) {
  const { currency } = options;
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
                {section.eyebrow && <span className="pt-section-eyebrow">{section.eyebrow}</span>}
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
                {/*
                  Proportional widths, no min-width, and no pixel colgroup.
                  Those three together were the horizontal scrollbar: thirteen
                  hardcoded pixel columns summing past 1400px meant every
                  viewport narrower than that got a scrollbar whether or not
                  the content needed one. Percentages let the columns shrink
                  with the window, and the name column keeps the slack.
                */}
                {/*
                  No min-width and no inline width. Every column is a share of
                  100%, so the table is exactly as wide as its frame whatever
                  the window or the number of custom properties — there is no
                  arithmetic left that can push it past the edge.
                */}
                <table className="pt-table">
                  <colgroup>
                    <col className="c-name" />
                    <col className="c-date" />
                    <col className="c-date" />
                    <col className="c-cat" />
                    <col className="c-people" />
                    <col className="c-status" />
                    <col className="c-when" />
                    <col className="c-next" />
                    <col className="c-prio" />
                    <col className="c-files" />
                    <col className="c-money" />
                    {options.custom.map((prop) => (
                      <col key={prop.name} className="c-custom" />
                    ))}
                    <col className="c-add" />
                  </colgroup>
                  <thead>
                    <tr>
                      {/*
                        Eleven columns, not thirteen. Client moved into the
                        project cell as its sub-line — it is an attribute of
                        the name, it was costing 92px of a window that had
                        none to spare, and the section above already says
                        which company the work belongs to.
                      */}
                      <th>Project</th>
                      <th>Start</th>
                      <th>Deadline</th>
                      <th>Category</th>
                      <th>Assigned</th>
                      <th>Status</th>
                      <th className="h-when">Updated</th>
                      <th className="h-next">Next task</th>
                      <th>Priority</th>
                      <th>Files</th>
                      <th>{personal ? "Billing" : "Budget"}</th>
                      {options.custom.map((prop) => (
                        <th
                          key={prop.name}
                          className="h-custom"
                          title={`${prop.type}${prop.editable ? "" : " — computed by Notion"}`}
                        >
                          {prop.name}
                        </th>
                      ))}
                      <th className="pt-add-col">
                        <AddPropertyButton />
                      </th>
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
                          options={options}
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
