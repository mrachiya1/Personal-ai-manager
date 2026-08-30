// Arranging the project list by hand.
//
// Notion's own databases let you drag a row anywhere and it stays there. The
// API does not expose whatever Notion uses internally to do that, so this
// keeps its own `Order` number property — and the whole design question is
// what to write when a row lands between two others.
//
// The obvious answer, renumbering every row 1..n on each drag, is wrong here:
// moving one project would PATCH forty Notion pages, at Notion's rate limit,
// and a drag that takes eight seconds and half-fails leaves a list in an
// order nobody chose. So a moved row gets the MIDPOINT between its new
// neighbours and nothing else is touched: one write per drag, and a failure
// affects exactly the row that was dragged.
//
// Midpoints run out of room eventually — doubles give about fifty halvings
// between two adjacent integers, which no human reaches by dragging, but a
// script could. `needsRebalance` says when the gap has closed to the point
// that a full renumber is worth its writes, and `rebalance` produces it.

import type { Project } from "./types";

/** The step between rows in a freshly numbered list. */
export const ORDER_STEP = 1000;

/** Below this gap, midpoints are running out and a renumber is due. */
const MIN_GAP = 0.0001;

export interface Orderable {
  id: string;
  order?: number;
}

/**
 * The list in the order it should render.
 *
 * Rows with no Order sort after every row that has one, keeping their
 * existing relative order. That is what lets the feature arrive without a
 * migration pass: a database where nobody has dragged anything looks exactly
 * as it did, and the first drag only positions the row that moved.
 */
export function sortByOrder<T extends Orderable>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ao = a.row.order;
      const bo = b.row.order;
      if (ao === undefined && bo === undefined) return a.i - b.i;
      if (ao === undefined) return 1;
      if (bo === undefined) return -1;
      if (ao !== bo) return ao - bo;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/**
 * The writes needed so `movedId` lands at `toIndex`.
 *
 * `rows` must be in display order, and `toIndex` is an index into that list
 * WITH THE MOVED ROW REMOVED — the only definition that makes "drop it at the
 * end" expressible.
 *
 * Usually one write: the moved row takes the midpoint between its new
 * neighbours. But a midpoint is only meaningful when the neighbours have
 * numbers, and on a list nobody has arranged yet most of them do not —
 * un-numbered rows all sort after every numbered one, so no single number can
 * place a row *between* two of them. Dragging the top project to the bottom
 * of a three-row list produced exactly that: the maths returned a number, the
 * write succeeded, and the row did not move.
 *
 * So the plan is CHECKED rather than assumed. Compute the one-write answer,
 * simulate the sort it would produce, and if that is not the order the person
 * asked for, number the whole section instead. The fallback costs N writes
 * once; after it, every later drag is a single write again.
 */
export function planMove(rows: Orderable[], movedId: string, toIndex: number): { id: string; order: number }[] {
  const from = rows.findIndex((r) => r.id === movedId);
  if (from < 0) return [];

  const without = rows.filter((r) => r.id !== movedId);
  const at = Math.max(0, Math.min(without.length, toIndex));
  if (at === from) return []; // dropped where it already was

  // What the list must look like afterwards.
  const desired = [...without.slice(0, at), rows[from], ...without.slice(at)].map((r) => r.id);

  const single = midpoint(without, at);
  const simulated = sortByOrder(rows.map((r) => (r.id === movedId ? { ...r, order: single } : r))).map((r) => r.id);
  if (simulated.join("\u0000") === desired.join("\u0000")) return [{ id: movedId, order: single }];

  // Number the section, in the order that was asked for, and write only what
  // actually changes.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: { id: string; order: number }[] = [];
  desired.forEach((id, i) => {
    const next = (i + 1) * ORDER_STEP;
    if (byId.get(id)?.order !== next) out.push({ id, order: next });
  });
  return out;
}

/**
 * A candidate number for the slot at `at`.
 *
 * Never null: this only proposes, and planMove() simulates the sort before
 * trusting it. Returning null when neither neighbour is numbered would give
 * up on the case that does work — the very first drag on a list nobody has
 * arranged, where dropping a row at the top needs exactly one write because
 * every un-numbered row already sorts after every numbered one.
 */
function midpoint(without: Orderable[], at: number): number {
  const beforeOrder = without[at - 1]?.order;
  const afterOrder = without[at]?.order;
  if (beforeOrder === undefined && afterOrder === undefined) {
    // Nothing to sit between. The only slot a single number can reach on an
    // otherwise un-numbered list is the top; the simulation rejects the rest.
    const numbered = without.filter((r) => r.order !== undefined).map((r) => r.order!);
    return numbered.length ? Math.min(...numbered) - ORDER_STEP : ORDER_STEP;
  }
  if (beforeOrder === undefined) return afterOrder! - ORDER_STEP;
  if (afterOrder === undefined) return beforeOrder + ORDER_STEP;
  return (beforeOrder + afterOrder) / 2;
}

/** The single-write form, kept for callers that only need the number. */
export function orderForMove(rows: Orderable[], movedId: string, toIndex: number): number | null {
  const plan = planMove(rows, movedId, toIndex);
  const mine = plan.find((w) => w.id === movedId);
  return plan.length === 1 && mine ? mine.order : null;
}

/** True when the gaps have collapsed far enough that a renumber is due. */
export function needsRebalance(rows: Orderable[]): boolean {
  const numbered = rows.filter((r) => r.order !== undefined);
  for (let i = 1; i < numbered.length; i++) {
    if (Math.abs(numbered[i].order! - numbered[i - 1].order!) < MIN_GAP) return true;
  }
  return false;
}

/**
 * A clean renumber of the whole list, preserving the order it is already in.
 *
 * Returns only the rows whose number actually changes, because the caller
 * turns each one into a Notion write and a no-op PATCH still costs a request
 * against the rate limit.
 */
export function rebalance(rows: Orderable[]): { id: string; order: number }[] {
  const out: { id: string; order: number }[] = [];
  sortByOrder(rows).forEach((row, i) => {
    const next = (i + 1) * ORDER_STEP;
    if (row.order !== next) out.push({ id: row.id, order: next });
  });
  return out;
}

/**
 * Moving one step up or down, for the ··· menu.
 *
 * Drag is unreachable by keyboard and awkward on a phone, so the arrows are
 * not a convenience — they are the accessible path to the same operation, and
 * they go through the same maths so the two can't disagree.
 */
export function planNudge(rows: Orderable[], movedId: string, direction: -1 | 1): { id: string; order: number }[] {
  const from = rows.findIndex((r) => r.id === movedId);
  if (from < 0) return [];
  const to = from + direction;
  if (to < 0 || to >= rows.length) return [];
  // `to` is already the right index in the reduced list, in both directions:
  // removing the moved row shifts everything after it down by one, so "the
  // slot after my neighbour" and "my neighbour's old index" are the same
  // number going down, and going up nothing below `to` moved at all.
  return planMove(rows, movedId, to);
}

/** Sorts a project list for display. */
export function sortProjects(projects: Project[]): Project[] {
  return sortByOrder(projects as Orderable[]) as Project[];
}
