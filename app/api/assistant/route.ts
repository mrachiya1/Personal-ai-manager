import { NextResponse } from "next/server";
import { getTodayContext, summarizeContextForAI } from "@/lib/context";
import { resolveOpenRouter } from "@/lib/ai";
import { notionConnected } from "@/lib/notion";
import { ASSISTANT_TOOLS, executeTool } from "@/lib/assistantTools";

export const runtime = "nodejs";

const SYSTEM_PROMPT_PREFIX = `You are the Orex OS Assistant — a floating helper available on every page of this app,
not just a Q&A advisor. Unlike the Advisor Chat, you can actually DO things: add tasks, projects, expenses, income,
payments, clients, goals, wishlist items, ideas, daily logs, team members, and accounts, by calling the tools
provided. You are talking to the person who owns this workspace.

Rules:
- If a tool needs a companyId / accountId / projectId / clientId and the user only gave you a name, call the
  matching list_* tool first to resolve the name to its id. Never invent an id.
- If a name given doesn't clearly match anything from a list_* call, ask the user to clarify rather than guessing.
- After successfully creating something, confirm briefly in plain language (what you created, and any key numbers) —
  don't recite raw tool output.
- Be concise. This is a small popover, not a report.
- If Notion isn't connected, tools will fail — tell the user plainly instead of retrying repeatedly.
- You may also just answer questions using the CONTEXT block below, same as the Advisor Chat, when the user isn't
  asking you to create anything.

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

  const ctx = await getTodayContext();
  const contextSummary = summarizeContextForAI(ctx);
  const model = ai.model;

  const chatMessages: any[] = [
    { role: "system", content: SYSTEM_PROMPT_PREFIX + contextSummary },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: { tool: string; ok: boolean; summary: string }[] = [];

  try {
    // Up to 5 rounds of tool calling before we force a plain-text answer.
    for (let round = 0; round < 5; round++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        return NextResponse.json({ error: msg, actions }, { status: 502 });
      }

      const msg = data?.choices?.[0]?.message;
      if (!msg) {
        return NextResponse.json({ error: "No response from the model", actions }, { status: 502 });
      }

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // Plain answer — we're done.
        return NextResponse.json({ reply: msg.content || "", actions });
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
        if (!(await notionConnected()) && fnName !== undefined) {
          result = { ok: false, error: "Notion isn't connected in this app instance, so nothing can be saved right now." };
        } else {
          try {
            result = await executeTool(fnName, fnArgs);
          } catch (err: any) {
            result = { ok: false, error: err?.message || "Tool call failed" };
          }
        }

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

        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      // loop continues — model sees tool results and decides what's next
    }

    return NextResponse.json({ reply: "I did several steps but ran out of turns — check what happened above and let me know if anything's missing.", actions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Assistant request failed", actions }, { status: 502 });
  }
}
