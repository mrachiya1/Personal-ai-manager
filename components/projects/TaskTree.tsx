"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import type { TaskNode, TaskTree as Tree } from "@/lib/taskTree";
import { DateCell, MultiPickCell, SelectCell, TextCell, type PickOption } from "@/components/projects/editable";
import Thumbnail from "@/components/projects/Thumbnail";

/* ==================================================================
   The nested task tree.

   One component renders every level. There is no Milestone component and no
   SubTask component, because "Showreel -> Shot 01 -> Lighting -> Turntable
   pass" is four levels today and could be six next month, and a screen that
   hardcodes three of them has to be rewritten to hold the fourth. Depth is a
   number the row is handed; everything that varies with it — the indent, the
   caret, the type word — is computed from that number.

   The one thing that is NOT recursive is the progress figure. Each node's bar
   reads the leaf counts that lib/taskTree.ts already rolled up, so a milestone
   and the project row above it can never disagree about how much is done.
   ================================================================== */

export const TASK_STATUSES = ["Backlog", "In Progress", "Blocked", "Done"];
export const TASK_PRIORITIES = ["Urgent", "High", "Normal", "Low"];

/** What a row at this depth is called, so the UI can say "sub-item" honestly. */
export function levelWord(depth: number): string {
  return depth === 0 ? "milestone" : depth === 1 ? "sub-task" : "sub-item";
}

export interface TaskTreeHandlers {
  patchTask: (task: Task, changes: Partial<Task>, body: Record<string, unknown>) => void;
  toggleTask: (task: Task) => void;
  addTask: (
    projectId: string,
    input: { title: string; dueDate?: string; startDate?: string; priority?: string; status: string; parentTaskId?: string }
  ) => Promise<void>;
  removeTask: (task: Task) => void;
}

function statusTone(value: string): string {
  const v = value.toLowerCase();
  if (/(done|complete)/.test(v)) return "badge paid";
  if (/(block|stuck|hold)/.test(v)) return "badge overdue";
  if (/(progress|doing)/.test(v)) return "badge med";
  return "badge pending";
}

function priorityTone(value?: string): string {
  const v = (value || "").toLowerCase();
  if (/urgent/.test(v)) return "prio urgent";
  if (/high/.test(v)) return "prio high";
  if (/low/.test(v)) return "prio low";
  return "prio medium";
}

/* ------------------------------------------------------------------ */
/* Add a task at any level                                             */
/* ------------------------------------------------------------------ */

/**
 * The same form at every depth — only the parent it writes and the words on
 * the button change. A separate "add sub-task" form per level would be three
 * copies of one thing, drifting apart the first time a field is added.
 */
function AddTaskForm({
  projectId,
  parentTaskId,
  depth,
  onAdd,
}: {
  projectId: string;
  parentTaskId?: string;
  depth: number;
  onAdd: TaskTreeHandlers["addTask"];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [status, setStatus] = useState("Backlog");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const word = depth === 0 ? "task" : "sub-task";

  if (!open) {
    return (
      <button className="tt-add-open" onClick={() => setOpen(true)} type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add {word}
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      // Dates and priority are kept: a run of sub-items under one milestone
      // usually shares them, and re-typing the same date four times is the
      // kind of friction that stops people breaking work down at all.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="tt-add" onSubmit={submit}>
      <input
        className="tt-add-name"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={depth === 0 ? "Task name — e.g. Shot 01 Animation" : "Sub-task — e.g. Lighting & Shading"}
      />
      <input className="tt-add-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />
      <input className="tt-add-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
      <select className="tt-add-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className="tt-add-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-save" disabled={saving || !title.trim()}>
        {saving ? "Adding…" : "Add"}
      </button>
      <button type="button" className="btn-discard" onClick={() => setOpen(false)} disabled={saving}>
        Done
      </button>
      {error && <span className="tt-add-error">{error}</span>}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* One node, at any depth                                              */
/* ------------------------------------------------------------------ */

function TaskRow({
  node,
  projectId,
  teamOptions,
  thumbs,
  expanded,
  onToggleExpand,
  handlers,
  baseRow,
  index,
}: {
  node: TaskNode;
  projectId: string;
  teamOptions: PickOption[];
  thumbs: Record<string, string>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  handlers: TaskTreeHandlers;
  baseRow: number;
  index: number;
}) {
  const { task } = node;
  const hasKids = node.children.length > 0;
  const isOpen = expanded.has(task.id);
  const done = task.status === "Done";

  // Each row claims three keyboard-grid columns. The index is the node's
  // position in the flattened render order, so a collapsed branch doesn't
  // leave holes in the grid the arrow keys would fall into.
  const col = 100 + index * 3;

  return (
    <>
      <li
        className={`tt-row${done ? " done" : ""}${node.detached ? " detached" : ""}`}
        style={{ ["--tt-depth" as string]: node.depth }}
        data-depth={node.depth}
      >
        <span className="tt-rail" aria-hidden />

        {hasKids ? (
          <button
            className={`tt-caret${isOpen ? " open" : ""}`}
            onClick={() => onToggleExpand(task.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${task.title} — ${node.children.length} ${levelWord(node.depth + 1)}s`}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ) : (
          <span className="tt-caret placeholder" aria-hidden />
        )}

        <button
          className={`tt-check${done ? " on" : ""}`}
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

        <span className="tt-thumb">
          <Thumbnail pageId={task.id} name={task.title} src={thumbs[task.id] || task.thumbnail?.url} category="task" size={32} />
        </span>

        <span className="tt-name">
          <TextCell
            value={task.title}
            onSave={(title) => handlers.patchTask(task, { title }, { title })}
            nav={{ row: baseRow, col }}
          />
          {node.detached && (
            <span className="tt-detached" title="Its parent task is missing or forms a loop, so it is shown at the top level">
              orphaned
            </span>
          )}
        </span>

        <span className="tt-dates">
          <DateCell
            value={task.startDate}
            placeholder="Start"
            onSave={(startDate) => handlers.patchTask(task, { startDate }, { startDate })}
            nav={{ row: baseRow, col: col + 1 }}
          />
          <span className="tt-dash">→</span>
          <DateCell
            value={task.dueDate}
            placeholder="Due"
            onSave={(dueDate) => handlers.patchTask(task, { dueDate }, { dueDate })}
            nav={{ row: baseRow, col: col + 2 }}
          />
        </span>

        <span className="tt-assign">
          <MultiPickCell
            selected={task.assignedTo}
            options={teamOptions}
            searchable
            heading="Assign to"
            placeholder="—"
            renderClosed={(chosen) => (
              <span className="pt-assign" aria-label={`Assigned to ${chosen.map((c) => c.label).join(", ")}`}>
                {chosen.slice(0, 3).map((c) => (
                  <span key={c.id} className="pt-dot" style={{ background: `var(--chart-${(c.id.charCodeAt(0) % 6) + 1})` }} title={c.label} />
                ))}
                {chosen.length > 3 && <span className="pt-dot-more">+{chosen.length - 3}</span>}
              </span>
            )}
            onSave={(assignedTo) => handlers.patchTask(task, { assignedTo }, { assignedTo })}
          />
        </span>

        <span className="tt-prio">
          <SelectCell
            value={task.priority || "Normal"}
            options={TASK_PRIORITIES}
            allowEmpty={false}
            heading="Priority"
            onSave={(priority) => handlers.patchTask(task, { priority }, { priority })}
            render={(v) => <span className={priorityTone(v)}>{v}</span>}
          />
        </span>

        <span className="tt-status">
          <SelectCell
            value={task.status}
            options={TASK_STATUSES}
            allowEmpty={false}
            heading="Status"
            onSave={(status) => handlers.patchTask(task, { status: status as Task["status"] }, { status })}
            render={(v) => <span className={statusTone(v)}>{v}</span>}
          />
        </span>

        <span className="tt-res">
          {task.files.length ? (
            <a className="tt-res-link" href={task.files[0].url} target="_blank" rel="noreferrer">
              {task.files.length === 1 ? "Check here" : `${task.files.length} files`}
            </a>
          ) : (
            <span className="tt-res-none">—</span>
          )}
        </span>

        <span className="tt-roll">
          {hasKids ? (
            <span className="tt-roll-inner" title={`${node.doneLeafCount} of ${node.leafCount} sub-items done`}>
              <span className="tt-roll-bar">
                <span className={node.progress === 100 ? "done" : ""} style={{ width: `${node.progress ?? 0}%` }} />
              </span>
              <span className="tt-roll-num">
                {node.doneLeafCount}/{node.leafCount}
              </span>
            </span>
          ) : (
            <span className="tt-roll-none" aria-hidden />
          )}
        </span>

        <button
          className="tt-del"
          type="button"
          onClick={() => handlers.removeTask(task)}
          aria-label={`Delete ${task.title}${hasKids ? ` and its ${node.leafCount} sub-items` : ""}`}
          title={hasKids ? `Deletes this and everything under it (${node.leafCount})` : "Delete"}
        >
          ✕
        </button>
      </li>

      {isOpen && hasKids && (
        <li className="tt-children" style={{ ["--tt-depth" as string]: node.depth + 1 }}>
          <ul className="tt-list">
            {node.children.map((child, i) => (
              <TaskRow
                key={child.task.id}
                node={child}
                projectId={projectId}
                teamOptions={teamOptions}
                thumbs={thumbs}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                handlers={handlers}
                baseRow={baseRow}
                index={index + i + 1}
              />
            ))}
          </ul>
          <div
            className="tt-add-wrap"
            data-parent={task.id}
            data-depth={node.depth + 1}
            style={{ ["--tt-depth" as string]: node.depth + 1 }}
          >
            <AddTaskForm projectId={projectId} parentTaskId={task.id} depth={node.depth + 1} onAdd={handlers.addTask} />
          </div>
        </li>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The tree for one project                                            */
/* ------------------------------------------------------------------ */

export default function TaskTree({
  tree,
  projectId,
  teamOptions,
  thumbs,
  handlers,
  baseRow,
}: {
  tree: Tree;
  projectId: string;
  teamOptions: PickOption[];
  thumbs: Record<string, string>;
  handlers: TaskTreeHandlers;
  baseRow: number;
}) {
  // Top level open, deeper levels closed. Opening everything on a project
  // broken down three levels deep is forty rows where the person wanted five;
  // opening nothing hides the fact that there is anything underneath at all.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.roots.map((n) => n.task.id)));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allIds: string[] = [];
  const collect = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      if (n.children.length) allIds.push(n.task.id);
      collect(n.children);
    }
  };
  collect(tree.roots);
  const allOpen = allIds.length > 0 && allIds.every((id) => expanded.has(id));

  return (
    <div className="pt-detail tt">
      <div className="pt-detail-head">
        <span>
          Breakdown
          {tree.depth > 1 && <span className="tt-depth-note"> · {tree.depth} levels deep</span>}
        </span>
        <span className="tt-head-right">
          {allIds.length > 0 && (
            <button className="link-btn" type="button" onClick={() => setExpanded(allOpen ? new Set() : new Set(allIds))}>
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          <span className="pt-detail-count">
            {tree.leafCount === 0 ? "none yet" : `${tree.doneLeafCount}/${tree.leafCount} done`}
          </span>
        </span>
      </div>

      {tree.roots.length === 0 ? (
        <div className="pt-empty">
          Nothing broken down yet. Add the first task below — sub-tasks nest under it as deep as the work actually goes,
          and the progress line fills from the deepest items up.
        </div>
      ) : (
        <ul className="tt-list tt-root">
          {tree.roots.map((node, i) => (
            <TaskRow
              key={node.task.id}
              node={node}
              projectId={projectId}
              teamOptions={teamOptions}
              thumbs={thumbs}
              expanded={expanded}
              onToggleExpand={toggle}
              handlers={handlers}
              baseRow={baseRow}
              index={i * 40}
            />
          ))}
        </ul>
      )}

      <div className="tt-add-wrap" data-depth={0}>
        <AddTaskForm projectId={projectId} depth={0} onAdd={handlers.addTask} />
      </div>
    </div>
  );
}
