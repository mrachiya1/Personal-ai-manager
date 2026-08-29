import { NextResponse } from "next/server";
import { getTodayContext, summarizeContextForAI } from "@/lib/context";
import { resolveOpenRouter, openRouterUrl } from "@/lib/ai";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are drafting a time-blocked schedule for TODAY for the user, inside "Orex OS".

Use the CONTEXT block (rules, numerology, Rahu Kalam/Yamagandam/Gulika Kalam windows, active projects, tasks due
today, overdue payments, recent mood/energy) to build a realistic day plan from 8:00 to 20:00.

Hard requirements:
- Route anything high-stakes (client calls, launches, contract sign-offs, cold outreach) OUTSIDE the inauspicious
  windows given in CONTEXT. Put study/documentation/admin/asset-organization INSIDE those windows instead.
- Include tasks due today and any triggered rule guidance as concrete blocks.
- Leave realistic breaks (lunch, at least one short rest).
- 6 to 10 blocks total. Keep each title under 8 words.

Respond with ONLY a raw JSON array (no markdown fences, no prose before/after), each item shaped exactly as:
{"time": "HH:MM", "durationMinutes": number, "title": string, "note": string}
"time" is 24-hour local time. "note" is one short sentence on why this block is placed here.`;

export async function POST() {
  const ai = await resolveOpenRouter("text");
  const apiKey = ai.apiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter API key set — add one on the Settings page to enable day planning." },
      { status: 400 }
    );
  }

  const ctx = await getTodayContext();
  const contextSummary = summarizeContextForAI(ctx);
  const model = ai.model;

  try {
    const res = await fetch(openRouterUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://orex-os.local",
        "X-Title": "Orex OS Day Plan",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nCONTEXT:\n" + contextSummary },
          { role: "user", content: "Draft today's plan." },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `OpenRouter request failed (${res.status})`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const raw = (data?.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    let plan: any[];
    try {
      plan = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "The model didn't return valid plan data — try again.", raw },
        { status: 502 }
      );
    }
    return NextResponse.json({ plan, dateISO: ctx.dateISO });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Day plan request failed" }, { status: 502 });
  }
}
