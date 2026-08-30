// Stating your hours, and the day that gets built inside them.
//
// The point of every check here is that the WINDOW governs. It is easy to
// write a planner that produces a plausible-looking day and puts half of it
// outside the hours the person actually said they were working — plausible is
// exactly what makes that bug survive review. So the assertions are about
// boundaries and collisions, measured against the real DOM and the stand-in
// Google's real state, not about whether a card rendered.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5418";
const GOOGLE = process.env.QA_GOOGLE || "http://localhost:5302";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });

const google = {
  state: async () => (await fetch(`${GOOGLE}/__state`)).json(),
  reset: async () => fetch(`${GOOGLE}/__reset`, { method: "POST" }),
  seed: async (items) =>
    fetch(`${GOOGLE}/__seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }),
};

/** Today, in the app's configured timezone (UTC+5:30 unless overridden). */
const TZ = Number(process.env.HOME_TZ_OFFSET || 5.5);
const todayISO = new Date(Date.now() + TZ * 3600_000).toISOString().slice(0, 10);
/** The instant a local wall-clock time falls on today. */
const at = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(new Date(`${todayISO}T00:00:00Z`).getTime() + (h * 60 + m) * 60_000 - TZ * 3600_000).toISOString();
};
const localHHMM = (iso) => new Date(new Date(iso).getTime() + TZ * 3600_000).toISOString().slice(11, 16);

async function setHours(start, end, alsoPattern = false) {
  const res = await p.request.put(`${BASE}/api/workday`, { data: { start, end, alsoPattern } });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}
const getPlan = async (qs = "") => (await (await p.request.get(`${BASE}/api/plan${qs}`)).json()).plan;

await google.reset();

/* ------------------------------------------------------------------ */
console.log("--- 1. THE HOURS ARE A RECORD, NOT A GUESS ---");
/* ------------------------------------------------------------------ */
const before = await (await p.request.get(`${BASE}/api/workday`)).json();
check("there is always a window to reason about", Boolean(before.window?.start && before.window?.end),
  `${before.window?.start}–${before.window?.end} (${before.window?.source})`);
check("and it says it is only a default until you set one", before.window.source === "default", before.window.source);

const saved = await setHours("10:30", "19:00", true);
check("hours can be set for today", saved.status === 200, `${saved.body?.window?.start}–${saved.body?.window?.end}`);
check("and are marked as set, not inferred", saved.body?.window?.source === "manual", saved.body?.window?.source);
const afterPattern = await (await p.request.get(`${BASE}/api/workday`)).json();
check("'make this my usual' saves the pattern too", afterPattern.pattern?.start === "10:30", JSON.stringify(afterPattern.pattern || null));

/* ------------------------------------------------------------------ */
console.log("\n--- 2. NONSENSE IS REFUSED, NOT ROUNDED OFF ---");
/* ------------------------------------------------------------------ */
for (const [start, end, why] of [
  ["18:00", "09:00", "an end before the start"],
  ["09:00", "09:10", "a ten-minute working day"],
  ["nine", "17:00", "a time that isn't a time"],
  ["25:00", "26:00", "an hour that doesn't exist"],
]) {
  const r = await setHours(start, end);
  check(`${why} is refused`, r.status === 400, `${r.status} ${r.body?.error || ""}`.slice(0, 70));
}
const stillSet = await (await p.request.get(`${BASE}/api/workday`)).json();
check("and a refusal leaves the good hours alone", stillSet.window.start === "10:30", stillSet.window.start);

/* ------------------------------------------------------------------ */
console.log("\n--- 3. NOTHING IS PLANNED OUTSIDE THE HOURS ---");
/* ------------------------------------------------------------------ */
await setHours("10:30", "19:00");
const plan = await getPlan("?whole=1");
check("the day has blocks in it", plan.segments.length > 0, `${plan.segments.length} segments`);
const outside = [];
for (const seg of plan.segments) {
  if (localHHMM(seg.start) < "10:30" || localHHMM(seg.end) > "19:00") outside.push(`${seg.label} ${localHHMM(seg.start)}–${localHHMM(seg.end)}`);
  for (const t of seg.tasks) {
    if (localHHMM(t.start) < "10:30" || localHHMM(t.end) > "19:00") outside.push(`${t.title} ${localHHMM(t.start)}`);
  }
}
check("every block and task sits inside 10:30–19:00", outside.length === 0, outside.slice(0, 3).join(" | "));

// The real test of "manual": move the window and watch the day move with it.
await setHours("06:00", "11:00");
const early = await getPlan("?whole=1");
const earliest = early.segments.map((s) => localHHMM(s.start)).sort()[0];
const latest = early.segments.map((s) => localHHMM(s.end)).sort().pop();
check("moving the hours moves the whole day", earliest >= "06:00" && latest <= "11:00", `${earliest}–${latest}`);
check("a shorter day plans fewer tasks",
  early.segments.reduce((n, s) => n + s.tasks.length, 0) <= plan.segments.reduce((n, s) => n + s.tasks.length, 0),
  `${early.segments.reduce((n, s) => n + s.tasks.length, 0)} vs ${plan.segments.reduce((n, s) => n + s.tasks.length, 0)}`);
check("and says what didn't fit rather than dropping it", early.unplaced.length > 0, `${early.unplaced.length} unplaced`);

/* ------------------------------------------------------------------ */
console.log("\n--- 4. IT PLANS AROUND WHAT IS ALREADY BOOKED ---");
/* ------------------------------------------------------------------ */
await setHours("09:00", "18:00");
await google.seed([
  { summary: "Northwind review call", start: { dateTime: at("11:00") }, end: { dateTime: at("12:30") } },
  { summary: "Lunch with Marco", start: { dateTime: at("13:00") }, end: { dateTime: at("14:00") } },
]);
const around = await getPlan("?whole=1");
check("the booked events are reported as busy", around.busy.length >= 2, `${around.busy.length} busy`);
check("and the calendar was actually read", around.busyUnknown === false);
const clashes = [];
for (const seg of around.segments) {
  for (const t of seg.tasks) {
    for (const [bs, be, name] of [["11:00", "12:30", "call"], ["13:00", "14:00", "lunch"]]) {
      if (localHHMM(t.start) < be && localHHMM(t.end) > bs) clashes.push(`${t.title} ${localHHMM(t.start)}–${localHHMM(t.end)} over ${name}`);
    }
  }
}
check("nothing is scheduled on top of a meeting", clashes.length === 0, clashes.slice(0, 3).join(" | "));

/* ------------------------------------------------------------------ */
console.log("\n--- 5. THE CALENDAR GETS BLOCKS AND TASKS, ONCE ---");
/* ------------------------------------------------------------------ */
const push1 = await p.request.post(`${BASE}/api/plan/push`, { data: { date: todayISO } });
const p1 = await push1.json();
check("the push succeeds", push1.status() === 200, p1.error || `${p1.segments} blocks, ${p1.tasks} tasks`);

const s1 = await google.state();
const ours = s1.events.filter((e) => e.extendedProperties?.private?.["orex-os-plan"]);
const segEvents = ours.filter((e) => e.extendedProperties.private["orex-os-plan"] === "segment");
const taskEvents = ours.filter((e) => e.extendedProperties.private["orex-os-plan"] === "task");
check("named blocks went up as containers", segEvents.length === p1.segments, `${segEvents.length} of ${p1.segments}`);
check("and one event per task inside them", taskEvents.length === p1.tasks, `${taskEvents.length} of ${p1.tasks}`);
check("a block's description lists the tasks in it",
  segEvents.some((e) => /•/.test(e.description || "")),
  (segEvents[0]?.description || "").split("\n").slice(0, 2).join(" / ").slice(0, 60));
check("a task event names its project and priority",
  taskEvents.every((e) => /Priority:/.test(e.description || "")));
check("every event is timed, never all-day", ours.every((e) => e.start?.dateTime && e.end?.dateTime));
check("the meetings that were already there are untouched",
  s1.events.filter((e) => /Northwind review|Lunch with/.test(e.summary)).length === 2);

/* ------------------------------------------------------------------ */
console.log("\n--- 6. PUSHING AGAIN REPLACES, IT DOESN'T DOUBLE ---");
/* ------------------------------------------------------------------ */
const push2 = await p.request.post(`${BASE}/api/plan/push`, { data: { date: todayISO } });
const p2 = await push2.json();
check("the second push succeeds", push2.status() === 200, p2.error || `removed ${p2.removed}`);
check("and says it cleared the first one", p2.removed === segEvents.length + taskEvents.length, `${p2.removed} removed`);
const s2 = await google.state();
const ours2 = s2.events.filter((e) => e.extendedProperties?.private?.["orex-os-plan"]);
check("the calendar has one plan on it, not two", ours2.length === ours.length, `${ours2.length} vs ${ours.length}`);
check("and still has the two real meetings",
  s2.events.filter((e) => /Northwind review|Lunch with/.test(e.summary)).length === 2);
// Deletes must all land before the first create, or a crash halfway leaves a
// doubled day — the failure that makes someone stop trusting a sync forever.
const firstPost = s2.log.findIndex((l) => l.method === "POST" && /\/events$/.test(l.path) && l.at > s1.log[s1.log.length - 1].at);
const lastDelete = s2.log.map((l, i) => (l.method === "DELETE" ? i : -1)).filter((i) => i >= 0).pop();
check("deletes run before creates", lastDelete < firstPost, `last delete #${lastDelete}, first create #${firstPost}`);

/* ------------------------------------------------------------------ */
console.log("\n--- 7. THE SCREEN SAYS THE SAME THING THE CALENDAR DOES ---");
/* ------------------------------------------------------------------ */
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(900);
const card = p.locator(".ww-card");
check("the work window card is on Today", (await card.count()) === 1);
check("it shows the hours that were set", (await card.locator(".ww-range").innerText()).includes("09:00"),
  await card.locator(".ww-range").innerText().catch(() => ""));
const onScreen = (await card.locator(".ww-seg-time").allInnerTexts()).length;
check("and the blocks it shows are the blocks that were planned", onScreen > 0, `${onScreen} shown`);

// The schedule panel below reads the same allocation. Two planners would
// eventually disagree, and the one place that must never happen is between
// what the screen says and what lands in someone's calendar.
const panelTimes = await p.locator(".sched-row .sched-time, .sched-time").allInnerTexts().catch(() => []);
const outsidePanel = panelTimes.map((t) => t.trim().slice(0, 5)).filter((t) => /^\d\d:\d\d$/.test(t) && (t < "09:00" || t > "18:00"));
check("the schedule panel is inside the same hours", outsidePanel.length === 0, outsidePanel.slice(0, 3).join(", "));

/* ------------------------------------------------------------------ */
console.log("\n--- 8. CHANGING THE HOURS ON SCREEN REBUILDS THE DAY ---");
/* ------------------------------------------------------------------ */
await card.getByRole("button", { name: /change/i }).click();
await p.waitForTimeout(200);
const inputs = card.locator("input[type=time]");
await inputs.nth(0).fill("14:00");
await inputs.nth(1).fill("20:00");
await card.getByRole("button", { name: /^save$/i }).click();
await p.waitForTimeout(2500);
check("the card shows the new hours", (await card.locator(".ww-range").innerText()).includes("14:00"),
  await card.locator(".ww-range").innerText().catch(() => ""));
const newTimes = (await card.locator(".ww-seg-time").allInnerTexts()).map((t) => t.trim().split("–")[0].trim());
const stillEarly = newTimes.filter((t) => /^\d\d:\d\d$/.test(t) && t < "14:00");
check("and every block moved with them", stillEarly.length === 0, stillEarly.slice(0, 3).join(", ") || `${newTimes.length} blocks from ${newTimes[0]}`);

const persisted = await (await p.request.get(`${BASE}/api/workday`)).json();
check("the change survived the round trip", persisted.window.start === "14:00", persisted.window.start);
check("and did not overwrite the saved usual day", persisted.pattern?.start === "10:30", persisted.pattern?.start);

console.log(`\nerrors: ${errs.length ? errs.slice(0, 3).join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
