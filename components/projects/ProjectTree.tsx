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
import { HIGHLIGHTS } from "@/lib/projectSchema";
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
  /** Puts a row's title cell straight into edit mode, from the ··· menu. */
  startRename: (key: string) => void;
  renameKey: string | null;
  clearRename: () => void;
  /** Opens the inline add-task row under a project or a task. */
  startAdd: (projectId: string, parentTaskId?: string) => void;
  addUnder: { projectId: string; parentTaskId?: string } | null;
  clearAdd: () => void;
  /** The workspace's own Notion properties, in a popover rather than columns. */
  openProperties: (row: ProjectRow) => void;
  /** Locally-stored previews, keyed by project or task page id. */
  thumbs: Record<string, string>;

  /* Arranging, marking and annotating a project. */

  /**
   * A row was dropped, or nudged with the menu arrows.
   *
   * `rows` is the section it lives in, in display order, because order is
   * per-section on screen: dragging a project to the top of Orextic must not
   * jump it above a project in another company's section that the person
   * cannot even see from here.
   */
  moveProject: (row: ProjectRow, rows: ProjectRow[], toIndex: number) => void;
  /** The colour mark, or "" to clear it. */
  setHighlight: (row: ProjectRow, name: string) => void;
  /** Opens the full panel: notes, every field, attachments, sub-tasks. */
  openDetails: (row: ProjectRow) => void;
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
  label,
  onRename,
  onAddSubtask,
  onResources,
  onProperties,
  onDelete,
  deleteLabel,
  onDetails,
  onMove,
  canMoveUp,
  canMoveDown,
  highlight,
  onHighlight,
}: {
  label: string;
  onRename: () => void;
  onAddSubtask?: () => void;
  onResources?: () => void;
  onProperties?: () => void;
  onDelete: () => void;
  deleteLabel: string;
  onDetails?: () => void;
  /** -1 up, 1 down. Absent on task rows, which are ordered by their parent. */
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  highlight?: string;
  onHighlight?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The colours live behind one more click rather than as six items in the
  // main list: a menu whose first six entries are colours buries Rename and
  // Delete, which is what people actually came for.
  const [colours, setColours] = useState(false);

  return (
    <div className="pt-menu-wrap">
      <button
        className={`pt-menu-btn${open ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <Popover onClose={() => { setOpen(false); setColours(false); }}>
          {colours ? (
            <>
              <button className="ed-opt back" onClick={() => setColours(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Highlight
              </button>
              {HIGHLIGHTS.map((h) => (
                <button
                  key={h.name}
                  className={`ed-opt hl${highlight === h.name ? " on" : ""}`}
                  onClick={() => { setOpen(false); setColours(false); onHighlight?.(h.name); }}
                  title={h.hint}
                >
                  <span className={`hl-dot ${h.tone}`} aria-hidden />
                  <span className="hl-name">{h.name}</span>
                  <span className="hl-hint">{h.hint}</span>
                </button>
              ))}
              <button
                className="ed-opt"
                onClick={() => { setOpen(false); setColours(false); onHighlight?.(""); }}
                disabled={!highlight}
              >
                <span className="hl-dot none" aria-hidden />
                <span className="hl-name">No highlight</span>
              </button>
            </>
          ) : (
          <>
          {onDetails && (
            <button className="ed-opt" onClick={() => { setOpen(false); onDetails(); }}>Open details &amp; notes</button>
          )}
          <button className="ed-opt" onClick={() => { setOpen(false); onRename(); }}>Rename</button>
          {onAddSubtask && (
            <button className="ed-opt" onClick={() => { setOpen(false); onAddSubtask(); }}>Add sub-task</button>
          )}
          {onResources && (
            <button className="ed-opt" onClick={() => { setOpen(false); onResources(); }}>Resources &amp; links</button>
          )}
          {onProperties && (
            <button className="ed-opt" onClick={() => { setOpen(false); onProperties(); }}>Properties…</button>
          )}
          {onHighlight && (
            <button className="ed-opt" onClick={() => setColours(true)}>
              <span className={`hl-dot ${HIGHLIGHTS.find((h) => h.name === highlight)?.tone || "none"}`} aria-hidden />
              {highlight ? `Highlight — ${highlight}` : "Highlight…"}
            </button>
          )}
          {/* The keyboard- and touch-reliable half of reordering. Drag is the
              fast path; these are the path that always works. */}
          {onMove && (
            <>
              <button className="ed-opt" onClick={() => { setOpen(false); onMove(-1); }} disabled={!canMoveUp}>
                Move up
              </button>
              <button className="ed-opt" onClick={() => { setOpen(false); onMove(1); }} disabled={!canMoveDown}>
                Move down
              </button>
            </>
          )}
          <button className="ed-opt danger" onClick={() => { setOpen(false); onDelete(); }}>{deleteLabel}</button>
          </>
          )}
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
  drag,
  index,
  total,
  sectionRows,
}: {
  row: ProjectRow;
  rowIndex: number;
  expanded: boolean;
  onToggle: () => void;
  handlers: TreeHandlers;
  options: TreeOptions;
  personal: boolean;
  /** Drag state, owned by the section so only one row can be lifted at once. */
  drag: {
    draggingId: string | null;
    overId: string | null;
    /** Which edge of the row the pointer is nearest — where it would land. */
    edge: "above" | "below" | null;
    onDragStart: (id: string) => void;
    /** The pointer moved; work out which row it is over from the y position. */
    onPointerMove: (clientY: number) => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
  index: number;
  total: number;
  /** The rows of this section, in display order — what the move maths acts on. */
  sectionRows: ProjectRow[];
}) {
  const { clientOptions, categoryOptions, teamOptions, statusOptions, priorityOptions, currency } = options;
  const p = row.project;
  const nav = (col: number): CellNav => ({ row: rowIndex, col });
  // Ten columns, fixed. Custom properties live in the row menu now, so a
  // workspace that adds five of them does not narrow this table by five.
  const columns = 10;

  return (
    <>
      {/*
        Pointer events, not the HTML5 drag-and-drop API.

        HTML5 DnD does not fire on touch at all — every phone and tablet would
        have had a feature that silently does nothing — and it cannot be
        driven by a test, so "you can drag a project" would have stayed an
        untested claim. Pointer events work on both and are drivable, at the
        cost of tracking the gesture by hand, which is what dragMove below is.

        data-highlight paints the row's spine. An attribute rather than a
        class so the CSS reads as one rule per colour instead of six, and so
        the value is legible in the DOM when something looks wrong.
      */}
      <tr
        data-project-row={p.id}
        className={
          `pt-row${expanded ? " open" : ""}${row.urgency === "late" ? " late" : ""}` +
          `${drag.draggingId === p.id ? " dragging" : ""}` +
          `${drag.overId === p.id && drag.edge ? ` drop-${drag.edge}` : ""}`
        }
        data-highlight={p.highlight || undefined}
      >
        {/* 0 — name */}
        <td className="pt-name-cell">
          <div className="pt-name">
            {/* A grip rather than the whole row. Dragging from anywhere would
                fight text selection in the name cell and the pickers in every
                other one; Notion puts a handle here for the same reason. */}
            <button
              className="pt-grip"
              type="button"
              aria-label={`Reorder ${p.name}. Use the row menu's Move up and Move down for keyboard.`}
              title="Drag to reorder"
              onPointerDown={(e) => {
                if (e.button !== 0 && e.pointerType === "mouse") return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.onDragStart(p.id);
              }}
              onPointerMove={(e) => drag.onPointerMove(e.clientY)}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                drag.onDrop();
              }}
              onPointerCancel={drag.onDragEnd}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
            </button>
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
                openWhen={handlers.renameKey === `project:${p.id}`}
                onOpened={handlers.clearRename}
                nav={nav(0)}
              />
              <span className="pt-subline">
                {!personal && (
                  <SelectCell
                    value={row.client?.name}
                    options={clientOptions}
                    placeholder="No client"
                    heading="Client"
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
                {/* Budget on the sub-line, with its settlement state as a
                    dot rather than a pill. The pill needed 60px the client
                    name did not have to give, and "is this paid" is a
                    three-state fact — a colour carries it, with the wording
                    on hover for anyone who needs the word. */}
                {!personal && (
                  <>
                    <span className="pt-dot-sep" aria-hidden />
                    <span
                      className={`pt-pay-dot ${row.payment.state.toLowerCase().replace(/\s+/g, "-")}`}
                      title={
                        row.payment.invoiced
                          ? `${row.payment.state} — ${money(row.payment.paid, currency)} paid of ${money(row.payment.invoiced, currency)} invoiced`
                          : "No invoice raised against this project yet"
                      }
                      aria-label={`Payment: ${row.payment.state}`}
                    />
                    <NumberCell
                      value={p.value}
                      prefix={currency === "LKR" ? "Rs " : "$"}
                      onSave={(v) => handlers.patch(p.id, { value: v }, { value: v ?? "" })}
                      nav={nav(2)}
                    />
                  </>
                )}
                {personal && p.headline && <span className="pt-headline">{p.headline}</span>}
              </span>
            </div>
          </div>
        </td>

        {/* An empty cell shows an em dash, not the column's own name. "Start"
            sitting under the Start header reads as a label repeated, and a
            row of those reads as a form nobody has filled in. */}
        {/* 1 — start */}
        <td data-label="Start">
          <DateCell
            value={p.startDate}
            format={shortDate}
            placeholder="—"
            onSave={(startDate) => handlers.patch(p.id, { startDate }, { startDate })}
            nav={nav(1)}
          />
        </td>

        {/* 2 — deadline */}
        <td data-label="Deadline">
          <DateCell
            value={p.deadline}
            format={shortDate}
            placeholder="—"
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
            placeholder="—"
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
            placeholder="—"
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

        {/* Files and the row's actions in one cell — the spec's tenth column.
            The menu is hover-revealed on a pointer and always present for a
            keyboard, because "visible on hover" and "reachable" are different
            requirements and only one of them is optional. */}
        <td className="pt-actions" data-label="Files">
          <div className="pt-actions-inner">
          <button className="pt-res" onClick={() => handlers.openResources(row)}>
            Check here
            {p.files.length > 0 && <span className="pt-res-count">{p.files.length}</span>}
          </button>
          <RowMenu
            label={p.name}
            onRename={() => handlers.startRename(`project:${p.id}`)}
            onAddSubtask={() => {
              if (!expanded) onToggle();
              handlers.startAdd(p.id, undefined);
            }}
            onResources={() => handlers.openResources(row)}
            onProperties={options.custom.length ? () => handlers.openProperties(row) : undefined}
            onDetails={() => handlers.openDetails(row)}
            onMove={(direction) => handlers.moveProject(row, sectionRows, index + direction)}
            canMoveUp={index > 0}
            canMoveDown={index < total - 1}
            highlight={p.highlight}
            onHighlight={(name) => handlers.setHighlight(row, name)}
            onDelete={() => handlers.requestDelete(row)}
            deleteLabel="Delete project…"
          />
          </div>
        </td>
      </tr>

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

  /**
   * Which row is being dragged, and where it would land.
   *
   * One piece of state for the whole tree rather than one per section, and it
   * carries the section key: a drag that started in Orextic must not show a
   * drop line in the Personal section below it. Order is per-section on
   * screen, so a cross-section drop has no meaning — it would move the row
   * relative to projects the person cannot see from where they are standing.
   */
  const [drag, setDrag] = useState<{
    sectionKey: string;
    id: string;
    overId: string | null;
    edge: "above" | "below" | null;
  } | null>(null);

  const dragFor = (sectionKey: string, rows: ProjectRow[]) => ({
    draggingId: drag?.sectionKey === sectionKey ? drag.id : null,
    overId: drag?.sectionKey === sectionKey ? drag.overId : null,
    edge: drag?.sectionKey === sectionKey ? drag.edge : null,
    onDragStart: (id: string) => setDrag({ sectionKey, id, overId: null, edge: null }),
    /**
     * Which row the pointer is over, and which half of it.
     *
     * Measured from the rows' own boxes rather than from elementFromPoint:
     * the grip has pointer capture for the whole gesture, so every event
     * targets the grip and elementFromPoint would answer with it every time.
     */
    onPointerMove: (clientY: number) => {
      setDrag((d) => {
        if (!d || d.sectionKey !== sectionKey) return d;
        let overId: string | null = null;
        let edge: "above" | "below" | null = null;
        for (const r of rows) {
          const el = document.querySelector(`tr[data-project-row="${CSS.escape(r.project.id)}"]`);
          if (!el) continue;
          const box = el.getBoundingClientRect();
          if (clientY >= box.top && clientY <= box.bottom) {
            overId = r.project.id;
            edge = clientY < box.top + box.height / 2 ? "above" : "below";
            break;
          }
        }
        if (overId === d.overId && edge === d.edge) return d;
        return { ...d, overId, edge };
      });
    },
    onDrop: () => {
      if (!drag || drag.sectionKey !== sectionKey || !drag.overId || !drag.edge) return setDrag(null);
      const moved = rows.find((r) => r.project.id === drag.id);
      const targetIndex = rows.findIndex((r) => r.project.id === drag.overId);
      if (!moved || targetIndex < 0) return setDrag(null);
      // The index is expressed in the list WITHOUT the dragged row, which is
      // what orderForMove() takes. Dropping below a target that sits after the
      // dragged row is already correct once the row is removed; dropping below
      // one that sits before it needs the +1.
      const from = rows.findIndex((r) => r.project.id === drag.id);
      let to = targetIndex + (drag.edge === "below" ? 1 : 0);
      if (from < targetIndex + (drag.edge === "below" ? 1 : 0)) to -= 1;
      handlers.moveProject(moved, rows, to);
      setDrag(null);
    },
    onDragEnd: () => setDrag(null),
  });

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
                    <col className="c-start" />
                    <col className="c-deadline" />
                    <col className="c-cat" />
                    <col className="c-people" />
                    <col className="c-status" />
                    <col className="c-when" />
                    <col className="c-next" />
                    <col className="c-prio" />
                    <col className="c-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      {/*
                        Ten columns, and every one of them earns its width.

                        Client and budget moved into the project cell as its
                        sub-line — both are attributes of the project rather
                        than independent facts, and between them they were
                        costing 17% of a table that had none to spare. The
                        workspace's own custom properties moved into the row
                        menu for the same reason: a Notion database grows
                        properties over time, and a screen that gives each one
                        a column gets narrower every month.
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
                      <th className="h-actions">Files &amp; actions</th>
</tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => {
                      const rowIndex = rowCursor++;
                      return (
                        <ProjectRowView
                          key={row.project.id}
                          row={row}
                          rowIndex={rowIndex}
                          index={i}
                          total={section.rows.length}
                          sectionRows={section.rows}
                          drag={dragFor(section.key, section.rows)}
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
