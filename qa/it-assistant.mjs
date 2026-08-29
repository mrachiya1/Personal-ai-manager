// End-to-end for the UI Control Engine: does the model actually see the
// screen, do the four mutation tools change it, and does the change land
// without a reload.
//
// Runs the real route against a scripted OpenRouter stand-in, then opens the
// dashboard in a browser and reads the rendered values back. Asserting on the
// API response alone would prove the store was written, not that the page
// changed — which is the half that has broken before.

import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:5413";
const LOG = process.env.QA_OR_LOG || "/tmp/or-requests.jsonl";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function ask(text) {
  const res = await fetch(`${BASE}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
  });
  return { status: res.status, body: await res.json() };
}

/** The system prompt from the most recent request the route made. */
function lastSystemPrompt() {
  const lines = fs.readFileSync(LOG, "utf8").trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  return last.messages.find((m) => m.role === "system")?.content || "";
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 160));
});

/* ------------------------------------------------------------------ */
console.log("--- 1. THE MODEL SEES THE SCREEN ---");
/* ------------------------------------------------------------------ */
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(500);

const onScreenGreeting = (await p.locator(".th-greeting").innerText()).trim();
const onScreenCards = [];
for (const c of await p.locator(".metric-grid .metric-card").all()) {
  onScreenCards.push({
    label: (await c.locator(".mx-label").innerText()).trim(),
    value: (await c.locator(".mx-value").innerText()).trim(),
  });
}
const planTitles = await p.locator(".plan-title").allInnerTexts();

await ask("READ_STATE what is on my dashboard?");
const prompt = lastSystemPrompt();

check("system prompt carries the UI STATE block", prompt.includes("WHAT IS ON THE USER'S SCREEN RIGHT NOW"));
check("greeting in the prompt matches the header", prompt.includes(onScreenGreeting), onScreenGreeting);
for (const c of onScreenCards) {
  check(`card "${c.label}" value ${c.value} is in the prompt`, prompt.includes(c.value));
}
check(
  "calendarPlan lists the same blocks the panel shows",
  planTitles.every((t) => prompt.includes(t.trim())),
  `${planTitles.length} blocks`
);
check("prompt names calculatedPeakHours", prompt.includes("calculatedPeakHours"));
check("prompt names restWindows", prompt.includes("restWindows"));
check("prompt names topMetrics", prompt.includes("topMetrics"));
check("prompt names activeTasks", prompt.includes("activeTasks"));
check("prompt lists dailySynthesis reasons", /dailySynthesis\.reasons/.test(prompt));

/* ------------------------------------------------------------------ */
console.log("\n--- 2. GREETING TOOL CHANGES THE HEADER ---");
/* ------------------------------------------------------------------ */
const g = await ask("GREETING_FIX the greeting is wrong, I'm working nights");
check("route reports uiChanged", g.body.uiChanged === true);
check("action chip describes the change", (g.body.actions || []).some((a) => a.ok && /Greeting/.test(a.summary)),
  (g.body.actions || []).map((a) => a.summary).join(" | "));

await p.reload({ waitUntil: "networkidle" });
const newGreeting = await p.locator(".th-greeting").innerText();
check("header now shows the new greeting", newGreeting.includes("Ayubowan Achintha CEO"), newGreeting.replace(/\n/g, " "));
check("header flags it as manual", (await p.locator(".th-greeting .manual-flag").count()) === 1);

// The next turn's prompt, not this one's: the system prompt is built before
// the tool runs, so checking the same request would only prove the override
// hadn't happened yet.
await ask("READ_STATE what does the header say now?");
const promptAfter = lastSystemPrompt();
check("the next turn is told the greeting is an override", promptAfter.includes("MANUAL OVERRIDE set from chat"));
check("the next turn quotes the new line", promptAfter.includes("Ayubowan Achintha CEO"));

/* ------------------------------------------------------------------ */
console.log("\n--- 3. SCHEDULE TOOL RE-LAYS THE PLAN ---");
/* ------------------------------------------------------------------ */
const s = await ask("SCHEDULE_FIX move the client call to 4pm");
check("route reports uiChanged", s.body.uiChanged === true);
await p.reload({ waitUntil: "networkidle" });
const titles = (await p.locator(".plan-title").allInnerTexts()).map((t) => t.trim());
check("both scripted blocks render", titles.includes("Client call — Irway") && titles.includes("Deep work — Vista shot 04"), titles.join(" | "));
const times = (await p.locator(".pw-range").allInnerTexts()).join(" ");
check("the moved block shows a 4pm start", /4:00\s*PM|16:00/i.test(times), times.replace(/\n/g, " ").slice(0, 120));
check(
  "the panel stops claiming the hora allocator placed them",
  (await p.locator(".sc-head .section-sub").first().innerText()).includes("Set by you in chat")
);

/* ------------------------------------------------------------------ */
console.log("\n--- 4. METRIC OVERRIDE IS FLAGGED, NOT DISGUISED ---");
/* ------------------------------------------------------------------ */
const m = await ask("METRIC_FIX the predictable revenue card is wrong");
check("route reports uiChanged", m.body.uiChanged === true);
await p.reload({ waitUntil: "networkidle" });
const manualCard = p.locator(".metric-card.manual");
check("exactly one card is marked manual", (await manualCard.count()) === 1);
check("it shows the value the tool was given", (await manualCard.locator(".mx-value").innerText()).trim() === "$14.2k");
check("its footer says where the number came from", (await manualCard.locator(".mx-foot").innerText()).includes("Vista retainer"));
check("it carries the manual chip", (await manualCard.locator(".manual-flag").count()) === 1);

/* ------------------------------------------------------------------ */
console.log("\n--- 5. BAD INPUT IS REFUSED, NOT GUESSED ---");
/* ------------------------------------------------------------------ */
const badMetric = await ask("METRIC_BAD set revenue to a dollar");
check("unknown metric key rejected", (badMetric.body.actions || []).some((a) => !a.ok && /Unknown metric key/.test(a.summary)),
  (badMetric.body.actions || []).map((a) => a.summary).join(" | "));
check("the model is told which keys are valid", /predictable/.test(badMetric.body.reply || ""));
check("nothing was marked uiChanged", badMetric.body.uiChanged === false);

const badTime = await ask("SCHEDULE_BAD move it to 4pm");
check("a non-HH:MM time is refused", /Times must be HH:MM/.test(badTime.body.reply || ""), (badTime.body.reply || "").slice(0, 90));

await p.reload({ waitUntil: "networkidle" });
const stillTitles = (await p.locator(".plan-title").allInnerTexts()).map((t) => t.trim());
check("the refused edit left the plan untouched", stillTitles.includes("Client call — Irway"));

/* ------------------------------------------------------------------ */
console.log("\n--- 6. RESYNTHESIS PROMOTES A FOCUS WITHOUT INVENTING ONE ---");
/* ------------------------------------------------------------------ */
const before = await p.locator(".synth-list li").allInnerTexts();
const r = await ask("RESYNTH rebuild the day around the invoice");
check("route reports uiChanged", r.body.uiChanged === true);
check("the tool returned the real score, not prose", /"score":\s*\d+/.test(r.body.reply || ""), (r.body.reply || "").slice(0, 80));
await p.reload({ waitUntil: "networkidle" });
const after = await p.locator(".synth-list li").allInnerTexts();
check("the focus line is first", (after[0] || "").includes("closing the Vista invoice"), (after[0] || "").slice(0, 80));
check("every calculated reason survived underneath", before.every((x) => after.some((y) => y.trim() === x.trim())),
  `${before.length} before, ${after.length} after`);

/* ------------------------------------------------------------------ */
console.log("\n--- 7. THE OVERRIDES CAN BE PUT BACK ---");
/* ------------------------------------------------------------------ */
await ask("CLEAR_ALL put the real numbers back");
await p.reload({ waitUntil: "networkidle" });
check("no manual cards remain", (await p.locator(".metric-card.manual").count()) === 0);
check("no manual flags remain", (await p.locator(".manual-flag").count()) === 0);
check("the greeting is calculated again", (await p.locator(".th-greeting").innerText()).trim() === onScreenGreeting);
const restored = (await p.locator(".plan-title").allInnerTexts()).map((t) => t.trim());
check("the allocator's plan is back", JSON.stringify(restored) === JSON.stringify(planTitles.map((t) => t.trim())),
  restored.join(" | "));
check(
  "the panel credits the allocator again",
  (await p.locator(".sc-head .section-sub").first().innerText()).includes("favourable hours")
);

/* ------------------------------------------------------------------ */
console.log("\n--- 8. RECORDS STILL GO TO NOTION ---");
/* ------------------------------------------------------------------ */
const n = await ask("NOTION_WRITE capture an idea");
check("create_idea succeeded through the same loop", (n.body.actions || []).some((a) => a.ok && /idea/.test(a.summary)),
  (n.body.actions || []).map((a) => a.summary).join(" | "));
check("a Notion write is not reported as a UI change", n.body.uiChanged === false);

/* ------------------------------------------------------------------ */
console.log("\n--- 9. THE CHAT WIDGET REFRESHES THE PAGE UNDER IT ---");
/* ------------------------------------------------------------------ */
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.locator(".chat-fab").click();
await p.locator(".chat-panel-input input").fill("GREETING_FIX fix my greeting");
await p.locator(".chat-panel-input button").click();
await p.waitForTimeout(2500);
check("the panel stayed open", (await p.locator(".chat-panel").count()) === 1);
check("it announced the live update", (await p.locator(".chat-live").count()) === 1,
  (await p.locator(".chat-live").innerText().catch(() => "")).replace(/\n/g, " "));
const liveHeader = await p.locator(".th-greeting").innerText();
check("the header changed without a reload", liveHeader.includes("Ayubowan Achintha CEO"), liveHeader.replace(/\n/g, " "));

await ask("CLEAR_ALL tidy up");

console.log(`\nerrors: ${errs.length ? errs.join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
