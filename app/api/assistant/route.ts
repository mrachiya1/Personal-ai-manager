import { NextResponse } from "next/server";
import { summarizeContextForAI } from "@/lib/context";
import { buildTodayView, describeUiState } from "@/lib/uiState";
import { resolveOpenRouter, openRouterUrl } from "@/lib/ai";
import { notionConnected } from "@/lib/notion";
import { ASSISTANT_TOOLS, executeTool, UI_TOOLS, MUTATES_UI } from "@/lib/assistantTools";

export const runtime = "nodejs";

const SYSTEM_PROMPT_PREFIX = `You are the Orex OS Assistant — a floating helper available on every page of this app,
not just a Q&A advisor. You can DO things: add tasks, projects, expenses, income, payments, clients, goals, wishlist
items, ideas, daily logs, team members and accounts, AND you can change what the Today dashboard is currently showing.
You are talking to the person who owns this workspace. Address him as a peer — he is the CEO, not a support ticket.

TWO KINDS OF CHANGE, and never confuse them:
- RECORDS live in Notion (create_* tools, mark_payment_paid, goal:<id> updates). Permanent.
- DISPLAY STATE is what the Today dashboard renders (update_dashboard_greeting, modify_daily_schedule,
  update_metrics_and_goals on a metric key, resynthesize_day_analysis). Scoped to today; it resets tomorrow.
  When you change display state, say so — "shown for today" — instead of implying it was saved to Notion.

WHEN THE USER SAYS SOMETHING ON SCREEN IS WRONG, answer in exactly this order, in four short beats:
1. ACKNOWLEDGE THE ACTUAL VALUE. Quote what the dashboard is showing right now, verbatim, from the UI STATE block
   below. Never ask "what does it say?" — you can see it. If the value they describe is not the value in the block,
   say so plainly, because that means their page is stale and a reload is the fix.
2. NAME THE ROOT CAUSE. Say which calculation produced it and which input was wrong — "the greeting reads Poya
   because tithi 15 is running", "capacity is 4h because 4.5h of sleep caps the body ceiling below the sky's".
   No hedging, no apology paragraph. If you don't know the cause, say that instead of inventing one.
3. FIX IT LIVE. Call the tool. The dashboard updates behind the chat without a page refresh.
4. CONFIRM WHAT CHANGED, in one line, with the new value and how long it holds.

Rules:
- If a tool needs a companyId / accountId / projectId / clientId and the user only gave you a name, call the
  matching list_* tool first to resolve the name to its id. Never invent an id.
- If a name doesn't clearly match anything from a list_* call, ask rather than guessing.
- modify_daily_schedule REPLACES the whole plan. Read calendarPlan below, apply the edit, resend every block.
- Prefer fixing the record over overriding a card. Override a metric only when he explicitly wants the displayed
  number changed — the card then carries a "manual" flag on screen, which is the honest trade.
- If he wants the real value back, call clear_dashboard_override rather than asking him to retype it.
- Never invent a figure. If a number can't be derived, say what's missing.
- Be concise. This is a small popover, not a report. Lead with the verdict.
- If Notion isn't connected, the create_* tools will fail — say so plainly. The dashboard tools still work.

CONTEXT:
`;

export async function POST(req: Request) {
  const ai = await resolveOpenRouter("text");
  const apiKey = ai.apiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter API key set — add one on the Settings page to enable the assistant." },
      { status: 400 }
    );
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // One build, shared: the same object the /today page renders. The model is
  // therefore reading the screen, not a parallel reconstruction of it.
  const view = await buildTodayView();
  const contextSummary = summarizeContextForAI(view.ctx);
  const uiState = describeUiState(view);
  const model = ai.model;

  const chatMessages: any[] = [
    { role: "system", content: `${SYSTEM_PROMPT_PREFIX}${contextSummary}\n\n${uiState}` },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: { tool: string; ok: boolean; summary: string }[] = [];
  // Set once any tool changes what the dashboard renders, so the client can
  // revalidate the page underneath the chat instead of asking for a reload.
  let uiChanged = false;
  const connected = await notionConnected();

  try {
    // Up to 5 rounds of tool calling before we force a plain-text answer.
    for (let round = 0; round < 5; round++) {
      const res = await fetch(openRouterUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://orex-os.local",
          "X-Title": "Orex OS Assistant",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: chatMessages,
          tools: ASSISTANT_TOOLS,
          tool_choice: "auto",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || `OpenRouter request failed (${res.status})`;
        return NextResponse.json({ error: msg, actions, uiChanged }, { status: 502 });
      }

      const msg = data?.choices?.[0]?.message;
      if (!msg) {
        return NextResponse.json({ error: "No response from the model", actions, uiChanged }, { status: 502 });
      }

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // Plain answer — we're done.
        return NextResponse.json({ reply: msg.content || "", actions, uiChanged });
      }

      // The assistant's tool-call message must be echoed back before the tool results.
      chatMessages.push({ role: "assistant", content: msg.content || null, tool_calls: toolCalls });

      for (const call of toolCalls) {
        const fnName = call.function?.name;
        let fnArgs: any = {};
        try {
          fnArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          fnArgs = {};
        }

        let result: any;
        // The dashboard tools write to this app's own store, not to Notion, so
        // a disconnected workspace must not block them — the greeting being
        // wrong is exactly the kind of thing someone fixes before connecting.
        const needsNotion = !fnName || !UI_TOOLS.has(fnName);
        if (needsNotion && !connected) {
          result = {
            ok: false,
            error: "Notion isn't connected in this app instance, so nothing can be saved there right now.",
          };
        } else {
          try {
            result = await executeTool(fnName, fnArgs);
          } catch (err: any) {
            result = { ok: false, error: err?.message || "Tool call failed" };
          }
        }

        if (fnName && result?.ok && MUTATES_UI.has(fnName)) uiChanged = true;

        if (fnName && fnName.startsWith("create_")) {
          actions.push({
            tool: fnName,
            ok: Boolean(result?.ok),
            summary: result?.ok ? `${fnName.replace("create_", "").replace(/_/g, " ")}: ${fnArgs.name || fnArgs.title || fnArgs.label || fnArgs.goal || fnArgs.item || fnArgs.idea || ""}`.trim() : (result?.error || "failed"),
          });
        }
        if (fnName === "mark_payment_paid") {
          actions.push({ tool: fnName, ok: Boolean(result?.ok), summary: result?.ok ? "Marked payment paid" : result?.error || "failed" });
        }
        // Dashboard changes get an action chip too — a change the user can see
        // land on the page still needs a line in the transcript saying what it
        // was and that it expires tonight.
        if (fnName && MUTATES_UI.has(fnName)) {
          const label: Record<string, string> = {
            update_dashboard_greeting: `Greeting → “${fnArgs.newGreeting || ""}” (today)`,
            modify_daily_schedule: `Plan re-laid — ${Array.isArray(fnArgs.timeBlocks) ? fnArgs.timeBlocks.length : 0} blocks (today)`,
            update_metrics_and_goals: String(fnArgs.key || "").startsWith("goal:")
              ? `Finance goal updated in Notion`
              : `${fnArgs.key} card → ${fnArgs.value} (today, manual)`,
            resynthesize_day_analysis: fnArgs.focusOverride
              ? `Day re-synthesised around “${fnArgs.focusOverride}”`
              : "Day re-synthesised",
            clear_dashboard_override: `Restored the calculated ${fnArgs.what}`,
          };
          actions.push({
            tool: fnName,
            ok: Boolean(result?.ok),
            summary: result?.ok ? label[fnName] || fnName : result?.error || "failed",
          });
        }

        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      // loop continues — model sees tool results and decides what's next
    }

    return NextResponse.json({
      reply: "I did several steps but ran out of turns — check what happened above and let me know if anything's missing.",
      actions,
      uiChanged,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Assistant request failed", actions, uiChanged }, { status: 502 });
  }
}
