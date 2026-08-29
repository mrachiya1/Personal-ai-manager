// Turns a flat list of tasks into the tree the Projects screen renders, and
// works out how far along each branch is.
//
// Two things here are worth stating outright, because both are the difference
// between a tree that works and one that hangs a browser tab.
//
// 1. COMPLETION ROLLS UP FROM LEAVES, NOT FROM CHILDREN.
//    A milestone with one done sub-task and one sub-task holding four items of
//    which none are done is not 50% complete. Counting immediate children gives
//    that answer; counting the leaves gives 1/5. Leaves are where the work
//    actually is, so leaves are what get counted, at every level.
//
// 2. THE DATA CAN LIE ABOUT ITS OWN SHAPE.
//    "Parent Task" is a Notion relation a person can edit by hand, so nothing
//    stops A pointing at B while B points at A, or a task pointing at itself,
//    or at a task in a different project. Every one of those is a render loop
//    or an invisible task. They are all handled explicitly below rather than
//    assumed away: a cycle is broken at the repeat and the node is promoted to
//    a root, and a task whose parent isn't in the same project is a root too.

import type { Task } from "./types";

export interface TaskNode {
  task: Task;
  /** 0 for a milestone directly under the project. */
  depth: number;
  children: TaskNode[];
  /** Every leaf at or below this node — the denominator for its progress. */
  leafCount: number;
  doneLeafCount: number;
  /** 0-100, from the leaves. Null only when the node itself is a leaf. */
  progress: number | null;
  /** True when this node broke a parent cycle and was re-rooted. */
  detached?: boolean;
}

export interface TaskTree {
  roots: TaskNode[];
  /** Across the whole tree — the project row's progress bar reads this. */
  leafCount: number;
  doneLeafCount: number;
  progress: number | null;
  /** Deepest level present, 1 for a flat list of milestones. */
  depth: number;
  /** Tasks whose parent chain looped; surfaced so the UI can say so. */
  detached: string[];
}

const isDone = (t: Task) => t.status === "Done";

/**
 * Walks a task's parent chain and reports whether it terminates.
 *
 * Returns false for a self-parent, a loop, or a parent outside `byId`. The
 * caller then treats the task as a root, which is the only rendering that
 * shows the task at all — the alternative is a subtree that recurses forever.
 */
function chainTerminates(task: Task, byId: Map<string, Task>): boolean {
  const seen = new Set<string>([task.id]);
  let cursor = task.parentTaskId;
  while (cursor) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) return false;
    cursor = parent.parentTaskId;
  }
  return true;
}

/**
 * Builds the tree for one project.
 *
 * `tasks` should already be filtered to that project: a parent in another
 * project is treated as absent, so a mis-set relation surfaces the task at the
 * top of its own project rather than hiding it under someone else's.
 */
export function buildTaskTree(tasks: Task[]): TaskTree {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const detached: string[] = [];

  const childrenOf = new Map<string, Task[]>();
  const roots: Task[] = [];

  for (const task of tasks) {
    const parentId = task.parentTaskId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parentId || !parent || !chainTerminates(task, byId)) {
      if (parentId && (!parent || !chainTerminates(task, byId))) detached.push(task.id);
      roots.push(task);
      continue;
    }
    const list = childrenOf.get(parentId);
    if (list) list.push(task);
    else childrenOf.set(parentId, [task]);
  }

  // Open work first, then by start date, then by due date, then by title. A
  // tree whose order depends on Notion's page ordering shuffles under the
  // user's cursor every time something is edited.
  const order = (a: Task, b: Task) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
    const ad = a.startDate || a.dueDate || "9999";
    const bd = b.startDate || b.dueDate || "9999";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.title.localeCompare(b.title);
  };

  let maxDepth = 0;

  function build(task: Task, depth: number): TaskNode {
    maxDepth = Math.max(maxDepth, depth + 1);
    const kids = (childrenOf.get(task.id) ?? []).sort(order).map((child) => build(child, depth + 1));

    if (kids.length === 0) {
      return {
        task,
        depth,
        children: [],
        leafCount: 1,
        doneLeafCount: isDone(task) ? 1 : 0,
        progress: null,
        detached: detached.includes(task.id) || undefined,
      };
    }

    const leafCount = kids.reduce((s, k) => s + k.leafCount, 0);
    const doneLeafCount = kids.reduce((s, k) => s + k.doneLeafCount, 0);
    return {
      task,
      depth,
      children: kids,
      leafCount,
      doneLeafCount,
      progress: leafCount ? Math.round((doneLeafCount / leafCount) * 100) : null,
      detached: detached.includes(task.id) || undefined,
    };
  }

  const built = roots.sort(order).map((t) => build(t, 0));
  const leafCount = built.reduce((s, n) => s + n.leafCount, 0);
  const doneLeafCount = built.reduce((s, n) => s + n.doneLeafCount, 0);

  return {
    roots: built,
    leafCount,
    doneLeafCount,
    progress: leafCount ? Math.round((doneLeafCount / leafCount) * 100) : null,
    depth: maxDepth,
    detached,
  };
}

/** Flattens the tree in render order, honouring which nodes are expanded. */
export function visibleNodes(nodes: TaskNode[], expanded: Set<string>): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (list: TaskNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length && expanded.has(n.task.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Every task at or below `id`, itself included. Used when deleting a branch. */
export function descendants(nodes: TaskNode[], id: string): string[] {
  const found: string[] = [];
  const collect = (n: TaskNode) => {
    found.push(n.task.id);
    n.children.forEach(collect);
  };
  const find = (list: TaskNode[]): boolean => {
    for (const n of list) {
      if (n.task.id === id) {
        collect(n);
        return true;
      }
      if (find(n.children)) return true;
    }
    return false;
  };
  find(nodes);
  return found;
}

/* ================================================================== */
/* Completion rollup                                                   */
/* ================================================================== */

export interface CascadeChange {
  id: string;
  status: "Done" | "In Progress";
  /** The task whose change caused this one — shown in the toast. */
  because: string;
}

/**
 * What else has to change when one task's status flips.
 *
 * Ticking the last sub-item under a milestone completes the milestone, and the
 * milestone completing may complete *its* parent, so this walks the whole
 * ancestor chain rather than one step. The reverse holds too: re-opening any
 * descendant re-opens every ancestor that had auto-completed, because a parent
 * marked Done above open work is a lie the progress bar would then repeat.
 *
 * Returns the changes rather than performing them, so the caller can apply
 * them to Notion and hand the same list to the client for an optimistic update
 * — two callers, one answer.
 */
export function cascadeCompletion(
  tasks: Task[],
  changedId: string,
  newStatus: string
): CascadeChange[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const changed = byId.get(changedId);
  if (!changed) return [];

  // The status being written hasn't reached this list yet, so apply it locally
  // before asking whether the parent's children are all done.
  const statusOf = new Map<string, string>(tasks.map((t) => [t.id, t.status]));
  statusOf.set(changedId, newStatus);

  const childrenOf = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const list = childrenOf.get(t.parentTaskId);
    if (list) list.push(t);
    else childrenOf.set(t.parentTaskId, [t]);
  }

  const out: CascadeChange[] = [];
  const seen = new Set<string>([changedId]);
  let cursor = changed.parentTaskId;
  let because = changed.title;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) break;
    const kids = childrenOf.get(cursor) ?? [];
    if (!kids.length) break;

    const allDone = kids.every((k) => statusOf.get(k.id) === "Done");
    const current = statusOf.get(cursor);

    if (allDone && current !== "Done") {
      out.push({ id: cursor, status: "Done", because });
      statusOf.set(cursor, "Done");
    } else if (!allDone && current === "Done") {
      out.push({ id: cursor, status: "In Progress", because });
      statusOf.set(cursor, "In Progress");
    } else {
      // Nothing changed at this level, so nothing can change above it either.
      break;
    }

    because = parent.title;
    cursor = parent.parentTaskId;
  }

  return out;
}
