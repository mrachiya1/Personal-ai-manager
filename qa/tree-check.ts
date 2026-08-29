import { buildTaskTree, cascadeCompletion, descendants, type TaskNode, type CascadeChange } from "../lib/taskTree";
import type { Task } from "../lib/types";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "  ok  " : "  FAIL"} ${l}${d ? " — " + d : ""}`); };

const T = (id: string, title: string, parent?: string, status = "Backlog"): Task =>
  ({ id, title, projectId: "p1", status: status as Task["status"], parentTaskId: parent, assignedTo: [], files: [] });

// Showreel -> Shot 01 -> {Planning, Modeling, Lighting, Render}
//           -> Shot 02 (leaf)
const tasks = [
  T("m1", "Shot 01 Animation"),
  T("m2", "Shot 02 Animation"),
  T("s1", "Animation Planning", "m1", "Done"),
  T("s2", "3D Modeling", "m1", "Done"),
  T("s3", "Lighting & Shading", "m1"),
  T("s4", "Final Render", "m1"),
];
let tree = buildTaskTree(tasks);
ok("two roots", tree.roots.length === 2);
ok("depth is 2", tree.depth === 2, String(tree.depth));
ok("five leaves, not six tasks", tree.leafCount === 5, String(tree.leafCount));
ok("project progress is 2/5 = 40%", tree.progress === 40, String(tree.progress));
ok("milestone progress is 2/4 = 50%", tree.roots[0].progress === 50, String(tree.roots[0].progress));
ok("a leaf milestone has null progress", tree.roots[1].progress === null);

// Three levels: the counting-children bug would say 50% here.
const deep = [
  T("m1", "Milestone"),
  T("a", "Sub A", "m1", "Done"),
  T("b", "Sub B", "m1"),
  T("b1", "Item 1", "b"), T("b2", "Item 2", "b"), T("b3", "Item 3", "b"), T("b4", "Item 4", "b"),
];
tree = buildTaskTree(deep);
ok("rolls up from leaves, not children (1/5 = 20%)", tree.roots[0].progress === 20, String(tree.roots[0].progress));
ok("depth is 3", tree.depth === 3, String(tree.depth));

// Four levels, as the spec's example runs.
const four = [T("l0","Showreel"), T("l1","Shot 01","l0"), T("l2","Lighting","l1"), T("l3","Turntable","l2")];
ok("four levels nest", buildTaskTree(four).depth === 4, String(buildTaskTree(four).depth));

// Hostile data.
const cyc = [T("a","A","b"), T("b","B","a")];
tree = buildTaskTree(cyc);
ok("a two-node cycle still renders both", tree.roots.length === 2, JSON.stringify(tree.roots.map((r: TaskNode)=>r.task.id)));
ok("and is reported as detached", tree.detached.length === 2);
const self = [T("a","A","a")];
ok("a self-parent does not hang", buildTaskTree(self).roots.length === 1);
const orphan = [T("a","A","ghost")];
tree = buildTaskTree(orphan);
ok("a missing parent promotes to root", tree.roots.length === 1 && tree.detached.includes("a"));
ok("empty list is safe", buildTaskTree([]).progress === null);

// descendants
ok("descendants collects a whole branch", descendants(buildTaskTree(deep).roots, "b").join(",") === "b,b1,b2,b3,b4",
   descendants(buildTaskTree(deep).roots, "b").join(","));

// Cascade
const c1 = [T("m","Milestone"), T("x","X","m","Done"), T("y","Y","m")];
ok("last child done completes the parent", JSON.stringify(cascadeCompletion(c1, "y", "Done")) === JSON.stringify([{id:"m",status:"Done",because:"Y"}]),
   JSON.stringify(cascadeCompletion(c1, "y", "Done")));
const c2 = [T("m","Milestone"), T("x","X","m","Done"), T("y","Y","m","Backlog")];
ok("a still-open sibling completes nothing", cascadeCompletion(c2, "x", "Done").length === 0);
const c3 = [T("g","Grand", undefined, "Done"), T("m","Mid","g","Done"), T("x","X","m","Done"), T("y","Y","m","Done")];
ok("re-opening a leaf re-opens every ancestor",
   JSON.stringify(cascadeCompletion(c3, "y", "Backlog").map((c: CascadeChange)=>`${c.id}:${c.status}`)) === JSON.stringify(["m:In Progress","g:In Progress"]),
   JSON.stringify(cascadeCompletion(c3, "y", "Backlog")));
const c4 = [T("g","Grand"), T("m","Mid","g"), T("x","X","m","Done"), T("y","Y","m")];
ok("completion climbs two levels at once",
   JSON.stringify(cascadeCompletion(c4, "y", "Done").map((c: CascadeChange)=>`${c.id}:${c.status}`)) === JSON.stringify(["m:Done","g:Done"]),
   JSON.stringify(cascadeCompletion(c4, "y", "Done")));
const c5 = [T("a","A","b","Done"), T("b","B","a","Done")];
ok("cascade does not loop on a cycle", Array.isArray(cascadeCompletion(c5, "a", "Backlog")));

console.log(`\n=== ${pass}/${pass+fail} ===`);
process.exit(fail ? 1 : 0);
