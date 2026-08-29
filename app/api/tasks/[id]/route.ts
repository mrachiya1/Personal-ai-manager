import { NextResponse } from "next/server";
import { getTasks, updateTask, archiveTask } from "@/lib/notion";
import { cascadeCompletion } from "@/lib/taskTree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A task's whole branch: itself and everything nested under it, cycle-safe. */
function branchOf(tasks: { id: string; parentTaskId?: string }[], rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    byParent.set(t.parentTaskId, [...(byParent.get(t.parentTaskId) ?? []), t.id]);
  }
  // Breadth-first with a seen-set. "Parent Task" is a relation a person can
  // edit by hand in Notion, so it can loop, and a recursive walk would then
  // never return.
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(byParent.get(next) ?? []));
  }
  return out;
}

/**
 * Updates one task, plus whatever its status change implies for the rest of
 * its branch.
 *
 * A parent's status is derived, not independent. If a milestone could be set
 * to Done on its own, the row would read "Done" directly above its own rollup
 * reading 0/3 — the status and the progress bar describing the same work and
 * disagreeing about it. So a status written to a task that has children is
 * written to the whole branch under it, whichever control sent it: the
 * checkbox, the status dropdown, or the Assistant.
 *
 * Upward is the other half of the same rule. Ticking the last sub-item under a
 * milestone completes the milestone, and that may complete the one above it,
 * so the ancestors cascade too.
 *
 * Both walks live here rather than in the component because they have to be
 * true of the data, not of one open tab: two people finishing the last two
 * sub-items from different browsers should both end up with the milestone
 * complete. The changed ids come back in the response so the client can apply
 * the same result without refetching the tree.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const settingStatus = typeof body?.status === "string" && body.status;
    if (!settingStatus) {
      await updateTask(id, body);
      return NextResponse.json({ ok: true, branch: [id], cascaded: [] });
    }

    const tasks = await getTasks();
    const branch = branchOf(tasks, id);

    // Sequential: Notion rate-limits at roughly three requests a second, and a
    // half-applied branch is worse than a slow one.
    for (const taskId of branch) {
      await updateTask(taskId, taskId === id ? body : { status: body.status });
    }

    const after = tasks.map((t) => (branch.includes(t.id) ? { ...t, status: body.status } : t));
    const cascaded = cascadeCompletion(after, id, body.status);
    for (const change of cascaded) await updateTask(change.id, { status: change.status });

    return NextResponse.json({ ok: true, branch, cascaded });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update task" },
      { status: 502 }
    );
  }
}

/**
 * Removes a task and everything nested under it.
 *
 * Deleting a milestone while its sub-items survive would leave them pointing
 * at a page that no longer exists — which buildTaskTree() renders as a pile of
 * orphans at the top level. The whole branch goes, or none of it does.
 *
 * As everywhere else in this app: Notion has no hard delete, so these are
 * archived and stay restorable from the workspace's trash.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tasks = await getTasks();
    const doomed = branchOf(tasks, id);
    // Deepest first, so a failure part-way through never leaves a live task
    // pointing at an archived parent.
    for (const taskId of [...doomed].reverse()) await archiveTask(taskId);
    return NextResponse.json({ ok: true, removed: doomed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete task" },
      { status: 502 }
    );
  }
}
