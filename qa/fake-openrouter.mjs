// A scripted stand-in for OpenRouter's chat-completions endpoint.
//
// The Assistant's value is in the loop — system prompt in, tool calls out,
// tool results back in, a reply at the end — and none of that is exercised by
// testing the tools directly. This serves deterministic tool calls keyed off a
// marker in the user's message, so the whole round trip runs offline: the real
// route code, the real tool executor, the real override store, the real page
// re-render.
//
// Every request body is appended to /tmp/or-requests.jsonl so a test can assert
// what the model was actually shown — which is the only way to prove the UI
// state injection is real and not a comment.
//
// Point the app at it with OPENROUTER_API_BASE_URL. Not shipped.

import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.argv[2] || 5301);
const LOG = process.argv[3] || "/tmp/or-requests.jsonl";
try {
  fs.rmSync(LOG);
} catch {}

/** The scripts, keyed by a marker the test puts in the user message. */
const SCRIPTS = {
  GREETING_FIX: [
    {
      tool: "update_dashboard_greeting",
      args: { newGreeting: "Ayubowan Achintha CEO", reason: "Working nights this week" },
    },
  ],
  SCHEDULE_FIX: [
    {
      tool: "modify_daily_schedule",
      args: {
        reason: "Client call moved to the afternoon",
        timeBlocks: [
          { title: "Deep work — Vista shot 04", start: "09:00", end: "11:30", note: "Best unblocked run" },
          { title: "Client call — Irway", start: "16:00", end: "16:45", note: "Moved from the morning" },
        ],
      },
    },
  ],
  METRIC_FIX: [
    { tool: "update_metrics_and_goals", args: { key: "predictable", value: "$14.2k", note: "Vista retainer confirmed by email" } },
  ],
  METRIC_BAD: [{ tool: "update_metrics_and_goals", args: { key: "revenue", value: "$1" } }],
  SCHEDULE_BAD: [
    { tool: "modify_daily_schedule", args: { reason: "bad input", timeBlocks: [{ title: "X", start: "4pm", end: "5pm" }] } },
  ],
  RESYNTH: [{ tool: "resynthesize_day_analysis", args: { focusOverride: "closing the Vista invoice" } }],
  CLEAR_ALL: [{ tool: "clear_dashboard_override", args: { what: "all" } }],
  READ_STATE: [{ tool: "get_dashboard_state", args: {} }],
  NOTION_WRITE: [{ tool: "create_idea", args: { idea: "QA idea from the assistant loop", priority: "Later" } }],
};

function pickScript(messages) {
  const firstUser = messages.find((m) => m.role === "user")?.content || "";
  for (const key of Object.keys(SCRIPTS)) if (firstUser.includes(key)) return { key, steps: SCRIPTS[key] };
  return { key: "NONE", steps: [] };
}

/** How many scripted steps have already run, counted from the tool results. */
function stepsDone(messages) {
  return messages.filter((m) => m.role === "tool").length;
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      parsed = {};
    }
    fs.appendFileSync(LOG, JSON.stringify(parsed) + "\n");

    const messages = parsed.messages || [];
    const { steps } = pickScript(messages);
    const done = stepsDone(messages);

    let message;
    if (done < steps.length) {
      const step = steps[done];
      message = {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: `call_${done}`,
            type: "function",
            function: { name: step.tool, arguments: JSON.stringify(step.args) },
          },
        ],
      };
    } else {
      // The final turn quotes the last tool result so a test can see that the
      // model was actually handed it, rather than trusting the route's own
      // action chips.
      const lastTool = [...messages].reverse().find((m) => m.role === "tool");
      message = {
        role: "assistant",
        content: `DONE ${lastTool ? lastTool.content : "no-tool"}`,
      };
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "qa", choices: [{ index: 0, message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }] }));
  });
});

server.listen(PORT, () => console.log(`fake-openrouter on ${PORT}, logging to ${LOG}`));
