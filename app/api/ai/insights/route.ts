import { NextResponse } from "next/server";
import {
  getProjects,
  getTasks,
  getCompanies,
  getExpenses,
  getIncome,
  getFinanceGoals,
  getPayments,
  notionConnected,
} from "@/lib/notion";
import { localDateISO, localMonthISO } from "@/lib/timezone";
import { resolveOpenRouter } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are an operations analyst reading a founder's live business data.

Rules:
- Only state things the data supports. Never invent a number.
- Prefer specifics ("Atlas CRM is 9 days past its deadline with 2 of 6 tasks done")
  over generalities ("some projects are behind").
- If nothing is genuinely worth flagging, say so rather than padding.
- At most 5 insights. Rank the most consequential first.

Respond with ONLY this JSON, no prose or code fences:
{"summary":"one or two sentences","insights":[{"headline":"short","detail":"one or two sentences","severity":"urgent|watch|info","evidence":"the figures you used"}]}`;

/** Compact the data hard: a model reasons better over 40 tidy rows than 4000 messy ones. */
async function projectsPayload(todayISO: string) {
  const [projects, tasks, companies] = await Promise.all([getProjects(), getTasks(), getCompanies()]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const stats = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.projectId) continue;
    const cur = stats.get(t.projectId) || { total: 0, done: 0 };
    cur.total += 1;
    if (t.status === "Done") cur.done += 1;
    stats.set(t.projectId, cur);
  }
  return {
    today: todayISO,
    projects: projects.map((p) => {
      const s = stats.get(p.id);
      const daysLeft = p.deadline
        ? Math.round((Date.parse(`${p.deadline}T12:00:00Z`) - Date.parse(`${todayISO}T12:00:00Z`)) / 86400000)
        : null;
      return {
        name: p.name,
        company: companyName.get(p.companyId) || null,
        status: p.status,
        deadline: p.deadline || null,
        daysUntilDeadline: daysLeft,
        renderPriority: p.renderPriority || null,
        estimatedRenderHours: p.estimatedRenderHours ?? null,
        tasksDone: s?.done ?? 0,
        tasksTotal: s?.total ?? 0,
      };
    }),
  };
}

async function financePayload(todayISO: string) {
  const [expenses, income, goals, payments] = await Promise.all([
    getExpenses(),
    getIncome(),
    getFinanceGoals(),
    getPayments(),
  ]);
  const month = localMonthISO();
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + (r.amount || 0), 0);
  const monthExpenses = expenses.filter((e) => (e.date || "").startsWith(month));
  const monthIncome = income.filter((i) => (i.date || "").startsWith(month));

  const byCategory: Record<string, number> = {};
  for (const e of monthExpenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;

  return {
    today: todayISO,
    month,
    monthIncomeTotal: Math.round(sum(monthIncome)),
    monthExpenseTotal: Math.round(sum(monthExpenses)),
    expensesByCategoryThisMonth: byCategory,
    recurringExpenses: expenses
      .filter((e) => e.recurring)
      .map((e) => ({ name: e.name, amount: e.amount, category: e.category })),
    goals: goals.map((g) => ({ goal: g.goal, type: g.type, target: g.targetAmount, saved: g.currentAmount, deadline: g.deadline ?? null })),
    unpaidPayments: payments
      .filter((p) => p.status !== "Paid")
      .map((p) => ({ label: p.label, amount: p.amount, dueDate: p.dueDate ?? null, status: p.status })),
    recentExpenses: expenses.slice(0, 25).map((e) => ({ name: e.name, amount: e.amount, category: e.category, date: e.date ?? null })),
  };
}

export async function POST(req: Request) {
  if (!(await notionConnected())) {
    return NextResponse.json({ error: "Connect your Notion workspace first." }, { status: 400 });
  }

  const ai = await resolveOpenRouter("text");
  if (!ai.apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter key set — add one on the Settings page to enable AI insights." },
      { status: 400 }
    );
  }

  let scope = "projects";
  try {
    const body = await req.json();
    if (body?.scope === "finance") scope = "finance";
  } catch {
    /* default scope */
  }

  const todayISO = localDateISO();

  let payload: unknown;
  try {
    payload = scope === "finance" ? await financePayload(todayISO) : await projectsPayload(todayISO);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read your Notion data" },
      { status: 502 }
    );
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://orex-os.local",
        "X-Title": "Orex OS Insights",
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 900,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Scope: ${scope}\n\nData:\n${JSON.stringify(payload)}` },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `OpenRouter request failed (${res.status})` },
        { status: 502 }
      );
    }

    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "The model didn't return usable JSON." }, { status: 502 });
    }

    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [],
      model: ai.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Insight generation failed" },
      { status: 502 }
    );
  }
}
