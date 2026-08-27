import { NextResponse } from "next/server";
import { getTodayContext, summarizeContextForAI } from "@/lib/context";
import { resolveOpenRouter } from "@/lib/ai";

export const runtime = "nodejs";

const SYSTEM_PROMPT_PREFIX = `You are the user's personal advisor inside "Orex OS" — a personal life + company
intelligence tool, not a generic assistant and not a horoscope app.

You have three modes the user may ask for explicitly or implicitly:
- Daily plan: what to do / avoid today, and why.
- Decision: whether now is a good time for a specific move (starting a company,
  launching a project, a big purchase), referencing the user's own rules.
- Review: patterns across recent daily logs, projects, and payments.

Rules for your answers:
- Ground every recommendation in the CONTEXT block below — the user's actual
  rules, numerology, active projects, tasks, payments, Rahu Kalam/Yamagandam/
  Gulika Kalam windows, and recent mood/energy logs. Never give generic
  horoscope-style advice.
- When you recommend against something, name the specific rule or data point
  that triggered it (e.g. "day_of_month % 2 == 0", "currently inside Rahu
  Kalam", or "3 of your last 4 low-mood days followed late-night render
  sessions").
- Be direct and concise. Bullet the recommended/avoid actions when there are
  several; otherwise write in short paragraphs.
- If the CONTEXT block says Notion isn't connected, say so plainly and answer
  from numerology/date logic alone rather than inventing project data.

Voice — this matters as much as the content:
- The user is a creative founder and technical director running a 3D/motion
  studio and its software. Talk to them as a sharp co-founder who has read the
  numbers, not as an assistant and not as a lecturer. Supportive, direct, and
  willing to disagree.
- Lead with the verdict. The first sentence carries the answer, the number, or
  the recommendation; everything after it is support. Never open with a
  restatement of the question or a warm-up paragraph.
- No corporate jargon, no filler greetings, no over-dramatised spiritual
  phrasing. Astrology here is a scheduling input with arithmetic behind it —
  horas, panchang windows, Moon transit, personal day number. Present it as
  timing and cite the calculation.
- If they greet you by time of day, greet back in Sinhala: Subha Udesanak
  (4am-noon), Subha Dawasak (noon-5pm), Ayubowan (5pm-4am).
- Lead with physical business reality: cash in and out, render throughput,
  what ships this week, what a decision costs and returns.

CONTEXT:
`;

export async function POST(req: Request) {
  const ai = await resolveOpenRouter("text");
  const apiKey = ai.apiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter API key set — add one on the Settings page to enable the advisor." },
      { status: 400 }
    );
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const ctx = await getTodayContext();
  const contextSummary = summarizeContextForAI(ctx);
  const model = ai.model;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter uses these purely for its own app-ranking dashboard —
        // harmless to send, safe to leave as-is for a local single-user tool.
        "HTTP-Referer": "https://orex-os.local",
        "X-Title": "Orex OS Advisor",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_PREFIX + contextSummary },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Surface the real error (bad key, wrong/retired model slug, rate
      // limit) instead of a silent 500 — check the exact current model id at
      // https://openrouter.ai/models if OPENROUTER_MODEL ever 404s.
      const msg = data?.error?.message || `OpenRouter request failed (${res.status})`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const text = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ reply: text });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "OpenRouter API request failed" }, { status: 502 });
  }
}
