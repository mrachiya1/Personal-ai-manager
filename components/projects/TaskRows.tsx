"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import type { TaskNode, TaskTree as Tree } from "@/lib/taskTree";
import { DateCell, MultiPickCell, Popover, SelectCell, TextCell, type PickOption } from "@/components/projects/editable";
import Thumbnail from "@/components/projects/Thumbnail";

/* ==================================================================
   Sub-tasks, as rows of the project table rather than a panel inside it.

   The earlier version rendered the breakdown into a single full-width cell
   with its own private grid. It looked like a card dropped into the table,
   and — worse — none of its columns lined up with the headers above them, so
   a date under "Deadline" was under that heading only by accident. Emitting
   real <tr>s on the parent's own colgroup is the whole fix: one grid, one set
   of headers, and a sub-task's status sits under the word "Status".

   One component still renders every level. Depth is a number the row is
   handed, and only the first cell reacts to it — the indent and the branch
   line. There is no Milestone component and no SubTask component, because
   "Showreel -> Shot 01 -> Lighting -> Turntable pass" is four levels today
   and could be six next month.
   ================================================================== */

export const TASK_STATUSES = ["Backlog", "In Progress", "Blocked", "Done"];

export const TASK_PRIORITIES = ["Urgent", "High", "Normal", "Low"];

/**
 * How far a row is pushed in, per level.
 *
 * A flat 20px per level is fine to three deep and ruinous at six: 120px out of
 * a name column that is about 300px wide leaves no room for the title, and the
 * breakdown a person actually wants ("phone pop -> 3D model -> materials ->
 * turntable -> denoise") is exactly where it collapses. The first three levels
 * keep the full step because that is where the shape is read; after that each
 * level costs 10px, which is still unambiguous against a branch line but stops
 * the column eating itself. Six levels is 84px, not 120px.
 */
export function indentFor(depth: number): number {
  return Math.min(depth, 3) * 20 + Math.max(0, depth - 3) * 10;
}


export interface TaskRowHandlers {
  patchTask: (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => void;
  toggleTask: (task: Task) => void;
  addTask: (
    projectId: string,
    input: { title: string; dueDate?: string; startDate?: string; priority?: string; status: string; parentTaskId?: string }
  ) => Promise<void>;
  removeTask: (task: Task) => void;
  thumbs: Record<string, string>;
  startRename: (key: string) => void;
  renameKey: string | null;
  clearRename: () => void;
  startAdd: (projectId: string, parentTaskId?: string) => void;
  addUnder: { projectId: string; parentTaskId?: string } | null;
  clearAdd: () => void;
}

function statusTone(value: string): string {
  const v = value.toLowerCase();
  if (/(done|complete)/.test(v)) return "badge paid";
  if (/(block|stuck|hold)/.test(v)) return "badge overdue";
  if (/(progress|doing|active)/.test(v)) return "badge med";
  return "badge pending";
}

function priorityTone(value?: string): string {
  const v = (value || "").toLowerCase();
  if (/urgent/.test(v)) return "prio urgent";
  if (/high/.test(v)) return "prio high";
  if (/low/.test(v)) return "prio low";
  return "prio medium";
}

/** "2h ago" / "3d ago", from Notion's own last-edited stamp. */
function relative(iso?: string): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/* ------------------------------------------------------------------ */
/* Add a task, inline, on the same grid                                */
/* ------------------------------------------------------------------ */

/**
 * A transparent row at the foot of a branch that turns into inputs in place.
 *
 * The inputs sit in the columns their values belong to — name under Project,
 * dates under Start and Deadline, status under Status. A form floating below
 * the table would make the person map five fields onto twelve headings in
 * their head, every time.
 */
function AddTaskRow({
  projectId,
  parentTaskId,
  depth,
  columns,
  onAdd,
  open,
  setOpen,
}: {
  projectId: string;
  parentTaskId?: string;
  depth: number;
  /** Total cells in a row, so the trailing filler spans correctly. */
  columns: number;
  onAdd: TaskRowHandlers["addTask"];
  /**
   * Open state lives in TaskRows, not here.
   *
   * It has to: "Add sub-task" on a task with no children yet must be able to
   * bring this row into existence, and a row that owns its own open flag
   * cannot be opened by something that hasn't mounted it. That was the bug —
   * the menu item set a hint, and the only component that read the hint was
   * one that never rendered for a childless task.
   */
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [status, setStatus] = useState("Backlog");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const word = depth === 0 ? "Add task" : "Add sub-task";
  const indent = { ["--pt-indent" as string]: `${indentFor(depth)}px` };

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(projectId, {
        title: title.trim(),
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        priority,
        status,
        parentTaskId,
      });
      setTitle("");
      // Dates and priority persist: a run of sub-items under one milestone
      // usually shares them, and re-typing the same date four times is the
      // friction that stops people breaking work down at all.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <tr className="pt-addrow" data-depth={depth} data-parent={parentTaskId || ""} style={indent}>
        <td className="pt-addrow-name">
          <button className="pt-add-open" type="button" onClick={() => setOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {word}
          </button>
        </td>
        <td colSpan={columns - 1} />
      </tr>
    );
  }

  return (
    <tr className="pt-addrow open" data-depth={depth} data-parent={parentTaskId || ""} style={indent}>
      <td className="pt-addrow-name">
        <input
          className="pt-inline-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={depth === 0 ? "Task name" : "Sub-task name"}
        />
        {error && <div className="pt-inline-error">{error}</div>}
      </td>
      <td>
        <input className="pt-inline-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />
      </td>
      <td>
        <input className="pt-inline-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Deadline" />
      </td>
      {/* Category, Assigned */}
      <td />
      <td />
      <td>
        <select className="pt-inline-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      {/* Updated, Next task */}
      <td />
      <td />
      <td>
        <select className="pt-inline-input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="pt-inline-actions" colSpan={columns - 9}>
        <button type="button" className="btn-save" onClick={submit} disabled={saving || !title.trim()}>
          {saving ? "Adding…" : "Add"}
        </button>
        <button type="button" className="btn-discard" onClick={() => setOpen(false)} disabled={saving}>
          Done
        </button>
      </td>
    </tr>
  );
}

/**
 * The ··· menu on a sub-task row.
 *
 * The same three actions a project has, minus the ones a task has no notion
 * of. Delete goes straight through — the branch it takes with it is named in
 * the confirmation toast rather than behind a modal, because a sub-task is a
 * cheap thing to recreate and Notion archives rather than erases.
 */
function TaskMenu({
  node,
  projectId,
  handlers,
}: {
  node: TaskNode;
  projectId: string;
  handlers: TaskRowHandlers;
}) {
  const [open, setOpen] = useState(false);
  const { task } = node;
  return (
    <span className="pt-menu-wrap">
      <button
        className={`pt-menu-btn${open ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${task.title}`}
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <button className="ed-opt" onClick={() => { setOpen(false); handlers.startRename(`task:${task.id}`); }}>
            Rename
          </button>
          <button className="ed-opt" onClick={() => { setOpen(false); handlers.startAdd(projectId, task.id); }}>
            Add sub-task
          </button>
          <button className="ed-opt danger" onClick={() => { setOpen(false); handlers.removeTask(task); }}>
            {node.children.length ? `Delete task and ${node.leafCount} items` : "Delete task"}
          </button>
        </Popover>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* One task, as a table row                                            */
/* ------------------------------------------------------------------ */

function TaskRow({
  node,
  projectId,
  teamOptions,
  columns,
  expanded,
  onToggleExpand,
  handlers,
  baseRow,
  index,
  adders,
  setAdder,
  onExpand,
}: {
  node: TaskNode;
  projectId: string;
  teamOptions: PickOption[];
  columns: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  handlers: TaskRowHandlers;
  baseRow: number;
  index: number;
  adders: Set<string>;
  setAdder: (key: string, open: boolean) => void;
  /** Opens a branch without closing it if it is already open — the toggle
   *  would hide the sub-task the person is about to add. */
  onExpand: (id: string) => void;
}) {
  const { task } = node;
  const hasKids = node.children.length > 0;
  const isOpen = expanded.has(task.id);
  /**
   * The add row appears under exactly the branch the person asked for it in.
   *
   * It used to render, permanently, at the foot of every expanded branch. Six
   * levels deep that is six stacked "+ Add sub-task" buttons in a column,
   * differing only by a 10–20px indent — nobody can tell which one adds to
   * which parent, and the breakdown they were reading is buried under its own
   * chrome. The + on each row is the affordance now; it sits against the task
   * it acts on, which is unambiguous, and it is one click rather than two.
   */
  const adderOpen = adders.has(task.id);
  const done = task.status === "Done";
  const col = 100 + index * 3;

  return (
    <>
      <tr
        className={`pt-sub${done ? " done" : ""}${node.detached ? " detached" : ""}`}
        data-depth={node.depth}
        // One custom property, read by both the desktop indent and the branch
        // elbow, and by the phone layout's left margin — so the two can't drift
        // out of step the way two hardcoded numbers would.
        style={{ ["--pt-indent" as string]: `${indentFor(node.depth)}px` }}
      >
        {/*
          Project name column — the only cell that knows about depth.

          The flex row is a div INSIDE the cell, never the cell itself: a <td>
          with display:flex stops being a table cell, drops out of the shared
          column grid, and takes every cell after it out of alignment with the
          headers. That was the original misalignment, and it is invisible in
          the markup — the classes all look right.
        */}
        <td className="pt-sub-name">
          <span className="pt-branch" aria-hidden />
          <div className="pt-sub-inner">
          {hasKids ? (
            <button
              className={`pt-caret sm${isOpen ? " open" : ""}`}
              onClick={() => onToggleExpand(task.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${task.title}`}
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ) : (
            <span className="pt-caret sm placeholder" aria-hidden />
          )}

          <button
            className={`pt-check sub${done ? " on" : ""}`}
            onClick={() => handlers.toggleTask(task)}
            aria-pressed={done}
            aria-label={`Mark ${task.title} ${done ? "not done" : "done"}`}
            type="button"
            title={
              hasKids
                ? `${done ? "Reopens" : "Completes"} this and all ${node.leafCount} items under it — a parent can't be done while its sub-items aren't`
                : undefined
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </button>

          {/* Smaller the deeper it sits. A 32px thumb is worth its space on a
              milestone; five levels down it is competing with the title for a
              column that the indent has already taken a bite out of, and the
              title is what the person is scanning for. */}
          <Thumbnail
            pageId={task.id}
            name={task.title}
            src={handlers.thumbs[task.id] || task.thumbnail?.url}
            category="task"
            size={node.depth >= 2 ? 24 : 32}
          />

          <span className="pt-sub-title">
            <TextCell
              value={task.title}
              onSave={(title) => handlers.patchTask(task, { title }, { title })}
              openWhen={handlers.renameKey === `task:${task.id}`}
              onOpened={handlers.clearRename}
              nav={{ row: baseRow, col }}
            />
          </span>

          {node.detached && (
            <span className="pt-flag" title="Its parent task is missing or forms a loop, so it is shown at the top level">
              orphaned
            </span>
          )}
          {hasKids && (
            <span className="pt-sub-count" title={`${node.doneLeafCount} of ${node.leafCount} sub-items done`}>
              {node.doneLeafCount}/{node.leafCount}
            </span>
          )}

          </div>
        </td>

        <td data-label="Start" data-empty={!task.startDate}>
          <DateCell
            value={task.startDate}
            format={shortDate}
            placeholder="—"
            onSave={(startDate) => handlers.patchTask(task, { startDate }, { startDate })}
            nav={{ row: baseRow, col: col + 1 }}
          />
        </td>
        <td data-label="Deadline" data-empty={!task.dueDate}>
          <DateCell
            value={task.dueDate}
            format={shortDate}
            placeholder="—"
            onSave={(dueDate) => handlers.patchTask(task, { dueDate }, { dueDate })}
            nav={{ row: baseRow, col: col + 2 }}
          />
        </td>

        {/* Category belongs to the project, not the task. Repeating the
            parent's value down every sub-row reads as data the task carries —
            it doesn't, and a blank says so. */}
        {/* data-empty is read only by the phone layout, where a cell with no
            value costs a whole line of a card. It stays tappable there — it
            just collapses onto one line instead of two, so a card of mostly
            blanks doesn't push the next sub-task off the screen. */}
        <td data-label="Category" data-empty={!task.tags?.length}>
          {task.tags && task.tags.length ? <span className="tag">{task.tags[0]}</span> : <span className="pt-inherit">—</span>}
        </td>

        <td data-label="Assigned" data-empty={!task.assignedTo?.length}>
          <MultiPickCell
            selected={task.assignedTo}
            options={teamOptions}
            searchable
            heading="Assign to"
            placeholder="—"
            renderClosed={(chosen) => (
              <span className="pt-assign" aria-label={`Assigned to ${chosen.map((c) => c.label).join(", ")}`}>
                {chosen.slice(0, 3).map((c) => (
                  <span
                    key={c.id}
                    className="pt-dot"
                    style={{ background: `var(--chart-${(c.id.charCodeAt(0) % 6) + 1})` }}
                    title={c.label}
                  />
                ))}
                {chosen.length > 3 && <span className="pt-dot-more">+{chosen.length - 3}</span>}
              </span>
            )}
            onSave={(assignedTo) => handlers.patchTask(task, { assignedTo }, { assignedTo })}
          />
        </td>

        <td data-label="Status">
          <SelectCell
            value={task.status}
            options={TASK_STATUSES}
            allowEmpty={false}
            heading="Status"
            onSave={(status) => handlers.patchTask(task, { status: status as Task["status"] }, { status })}
            render={(v) => <span className={statusTone(v)}>{v}</span>}
          />
        </td>

        <td className="pt-muted" data-label="Updated">
          {relative(task.lastEditedTime)}
        </td>

        <td className="pt-inherit" data-label="Next task">
          {hasKids ? node.children.find((c) => c.task.status !== "Done")?.task.title ?? "All done" : "—"}
        </td>

        <td data-label="Priority">
          <SelectCell
            value={task.priority || "Normal"}
            options={TASK_PRIORITIES}
            allowEmpty={false}
            heading="Priority"
            onSave={(priority) => handlers.patchTask(task, { priority }, { priority })}
            render={(v) => <span className={priorityTone(v)}>{v}</span>}
          />
        </td>

        <td className="pt-actions" data-label="Files">
          <div className="pt-actions-inner">
          {task.files.length ? (
            <a className="pt-res-link" href={task.files[0].url} target="_blank" rel="noreferrer">
              Check here
            </a>
          ) : (
            <span className="pt-inherit">—</span>
          )}
          <button
            className="pt-add-btn"
            type="button"
            onClick={() => {
              onExpand(task.id);
              setAdder(task.id, true);
            }}
            aria-label={`Add a sub-task under ${task.title}`}
            title="Add a sub-task"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <TaskMenu node={node} handlers={handlers} projectId={projectId} />
          </div>
        </td>
      </tr>

      {isOpen &&
        node.children.map((child, i) => (
          <TaskRow
            key={child.task.id}
            node={child}
            projectId={projectId}
            teamOptions={teamOptions}
            columns={columns}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            handlers={handlers}
            baseRow={baseRow}
            index={index + i + 1}
            adders={adders}
            setAdder={setAdder}
            onExpand={onExpand}
          />
        ))}

      {adderOpen && (
        <AddTaskRow
          projectId={projectId}
          parentTaskId={task.id}
          depth={node.depth + 1}
          columns={columns}
          onAdd={handlers.addTask}
          open={adderOpen}
          setOpen={(v) => setAdder(task.id, v)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Every task under one project, as rows                               */
/* ------------------------------------------------------------------ */

/** MM/DD/YYYY, matching the parent rows — mixing formats in one column reads
 *  as two different kinds of date. */
export function shortDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

export default function TaskRows({
  tree,
  projectId,
  teamOptions,
  columns,
  handlers,
  baseRow,
}: {
  tree: Tree;
  projectId: string;
  teamOptions: PickOption[];
  columns: number;
  handlers: TaskRowHandlers;
  baseRow: number;
}) {
  // Top level open, deeper levels closed. Opening everything on a project
  // broken down three levels deep is forty rows where the person wanted five;
  // opening nothing hides that there is anything underneath at all.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.roots.map((n) => n.task.id)));

  /**
   * Which add rows are open, keyed by the id of the task they add under
   * (`""` for the project's own top level).
   *
   * This lives here rather than in each AddTaskRow because "Add sub-task" on a
   * leaf has to summon a row that does not exist yet. A row cannot open
   * itself into existence.
   */
  const [adders, setAdders] = useState<Set<string>>(() => new Set());
  const setAdder = useCallback((key: string, open: boolean) => {
    setAdders((prev) => {
      const next = new Set(prev);
      open ? next.add(key) : next.delete(key);
      return next;
    });
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expand = useCallback(
    (id: string) => setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id))),
    []
  );

  /**
   * The ··· menu asks for an add row; this is where the ask lands.
   *
   * Opening the branch matters as much as opening the row: a task that already
   * has three sub-items and is collapsed would otherwise sprout an input with
   * its existing siblings still hidden, which reads as though the new item
   * went somewhere else.
   */
  const ask = handlers.addUnder;
  const askKey = ask && ask.projectId === projectId ? ask.parentTaskId ?? "" : null;
  useEffect(() => {
    if (askKey === null) return;
    setAdder(askKey, true);
    if (askKey) expand(askKey);
    handlers.clearAdd();
  }, [askKey, setAdder, expand, handlers]);

  return (
    <>
      {tree.roots.length === 0 && (
        <tr className="pt-sub empty">
          <td colSpan={columns} className="pt-sub-empty">
            Nothing broken down yet. Add the first task below, then use the + on its row to split it — sub-tasks nest
            as deep as the work goes, and the progress line fills from the deepest items up.
          </td>
        </tr>
      )}

      {tree.roots.map((node, i) => (
        <TaskRow
          key={node.task.id}
          node={node}
          projectId={projectId}
          teamOptions={teamOptions}
          columns={columns}
          expanded={expanded}
          onToggleExpand={toggle}
          handlers={handlers}
          baseRow={baseRow}
          index={i * 40}
          adders={adders}
          setAdder={setAdder}
          onExpand={expand}
        />
      ))}

      <AddTaskRow
        projectId={projectId}
        depth={0}
        columns={columns}
        onAdd={handlers.addTask}
        open={adders.has("")}
        setOpen={(v) => setAdder("", v)}
      />
    </>
  );
}
