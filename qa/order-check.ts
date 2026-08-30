// The ordering maths, on its own.
//
// Reordering is the kind of feature whose bugs are invisible: a "move down"
// that moves nothing, a drag that lands one slot off, a midpoint written the
// wrong side of a neighbour. None of them throw, and all of them look like
// the UI being flaky rather than the arithmetic being wrong. So the
// arithmetic gets its own test, with no browser and no Notion in the way.

import {
  ORDER_STEP,
  needsRebalance,
  planMove,
  planNudge,
  rebalance,
  sortByOrder,
  type Orderable,
} from "../lib/projectOrder";

let pass = 0;
let fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ok  " : "  FAIL"} ${l}${d ? " — " + d : ""}`);
};

const R = (id: string, order?: number): Orderable => ({ id, order });
const ids = (rows: Orderable[]) => rows.map((r) => r.id).join(",");

/** Applies a plan and re-sorts, exactly the way the app does. */
function apply(rows: Orderable[], plan: { id: string; order: number }[]): Orderable[] {
  if (!plan.length) return rows;
  const byId = new Map(plan.map((w) => [w.id, w.order]));
  return sortByOrder(rows.map((r) => (byId.has(r.id) ? { ...r, order: byId.get(r.id)! } : r)));
}
/** The order a move would write for the moved row, or null if it writes none. */
const orderOf = (plan: { id: string; order: number }[], id: string) =>
  plan.find((w) => w.id === id)?.order ?? null;

/* ------------------------------------------------------------------ */
console.log("--- sorting ---");
/* ------------------------------------------------------------------ */
ok("numbered rows sort by their number",
  ids(sortByOrder([R("c", 3000), R("a", 1000), R("b", 2000)])) === "a,b,c");
ok("un-numbered rows keep their existing order, after the numbered ones",
  ids(sortByOrder([R("x"), R("y"), R("a", 1000)])) === "a,x,y");
ok("a tie keeps the incoming order rather than shuffling",
  ids(sortByOrder([R("a", 500), R("b", 500)])) === "a,b");

/* ------------------------------------------------------------------ */
console.log("\n--- moving one row ---");
/* ------------------------------------------------------------------ */
const three = [R("a", 1000), R("b", 2000), R("c", 3000)];

ok("dropping a row where it already is writes nothing", planMove(three, "b", 1).length === 0);
ok("and so does dropping the first row at the top", planMove(three, "a", 0).length === 0);
ok("and the last row at the bottom", planMove(three, "c", 2).length === 0);

ok("moving c to the top lands before a", ids(apply(three, planMove(three, "c", 0))) === "c,a,b");
ok("moving a to the bottom lands after c", ids(apply(three, planMove(three, "a", 2))) === "b,c,a");
ok("moving a between b and c takes the midpoint",
  orderOf(planMove(three, "a", 1), "a") === 2500, String(orderOf(planMove(three, "a", 1), "a")));
ok("and it is a single write", planMove(three, "a", 1).length === 1);
ok("and lands there", ids(apply(three, planMove(three, "a", 1))) === "b,a,c");

ok("an index past the end is clamped, not an error",
  ids(apply(three, planMove(three, "a", 99))) === "b,c,a");
ok("an unknown id is a no-op", planMove(three, "nope", 0).length === 0);

/* ------------------------------------------------------------------ */
console.log("\n--- the arrows in the menu ---");
/* ------------------------------------------------------------------ */
ok("move down swaps with the row below", ids(apply(three, planNudge(three, "a", 1))) === "b,a,c");
ok("move up swaps with the row above", ids(apply(three, planNudge(three, "c", -1))) === "a,c,b");
ok("move up on the first row does nothing", planNudge(three, "a", -1).length === 0);
ok("move down on the last row does nothing", planNudge(three, "c", 1).length === 0);

// Down, down, up should land where one down would.
let walked = [...three];
walked = apply(walked, planNudge(walked, "a", 1));
walked = apply(walked, planNudge(walked, "a", 1));
walked = apply(walked, planNudge(walked, "a", -1));
ok("repeated nudges compose correctly", ids(walked) === "b,a,c", ids(walked));

/* ------------------------------------------------------------------ */
console.log("\n--- a list nobody has ever ordered ---");
/* ------------------------------------------------------------------ */
const fresh = [R("a"), R("b"), R("c")];
ok("moving to the top of an unnumbered list is one write",
  planMove(fresh, "c", 0).length === 1, `${planMove(fresh, "c", 0).length} writes`);
ok("and it lands", ids(apply(fresh, planMove(fresh, "c", 0))) === "c,a,b");

// The case that shipped broken: a single midpoint cannot place a row BETWEEN
// two un-numbered rows, because every un-numbered row sorts after every
// numbered one. The plan has to notice and number the section instead.
const mixed = [R("a", 1000), R("b"), R("c")];
const toBottom = planMove(mixed, "a", 2);
ok("moving a numbered row below un-numbered ones numbers the section",
  toBottom.length > 1, `${toBottom.length} writes`);
ok("and the result is the order that was asked for",
  ids(apply(mixed, toBottom)) === "b,c,a", ids(apply(mixed, toBottom)));
ok("a plan never leaves the list in an order nobody chose",
  [0, 1, 2].every((i) => {
    const plan = planMove(mixed, "b", i);
    if (!plan.length) return true;
    const want = (() => {
      const rest = mixed.filter((r) => r.id !== "b");
      return [...rest.slice(0, i), R("b"), ...rest.slice(i)].map((r) => r.id).join(",");
    })();
    return ids(apply(mixed, plan)) === want;
  }));

/* ------------------------------------------------------------------ */
console.log("\n--- running out of midpoints ---");
/* ------------------------------------------------------------------ */
// Halving a gap repeatedly is what eventually exhausts it. Constructed
// directly rather than reached through sixty simulated drags: the property
// under test is needsRebalance's threshold, and driving it through the drag
// loop tests the loop instead — planMove renumbers the section whenever a
// single write cannot express the move, which resets the gap it was
// supposed to be closing.
let tight: Orderable[] = [R("a", 1000), R("c", 3000)];
let lo = 1000;
let hi = 3000;
for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
  const mid = (lo + hi) / 2;
  tight = sortByOrder([...tight, R(`x${i}`, mid)]);
  hi = mid;
}
ok("the gap eventually collapses", needsRebalance(tight));
const fixed = rebalance(tight);
ok("a rebalance renumbers what it has to", fixed.length > 0, `${fixed.length} writes`);
const after = sortByOrder(tight.map((r) => ({ ...r, order: fixed.find((f) => f.id === r.id)?.order ?? r.order })));
ok("and preserves the order it found", ids(after) === ids(tight), `${ids(tight)} -> ${ids(after)}`);
ok("the rebalanced list no longer needs rebalancing", !needsRebalance(after));
ok("a clean list needs no rebalance", !needsRebalance([R("a", ORDER_STEP), R("b", 2 * ORDER_STEP)]));
ok("and rebalancing an already-clean list writes nothing",
  rebalance([R("a", 1000), R("b", 2000)]).length === 0);

console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
process.exit(fail ? 1 : 0);
