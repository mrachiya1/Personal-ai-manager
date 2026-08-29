// The tool surface for the floating Assistant widget (components/ChatWidget.tsx)
// and its API route (app/api/assistant/route.ts). Every mutating tool here is a
// thin pass-through to an existing lib/notion.ts create*/start*/end* function —
// no new write paths, just an AI-callable front door onto the same functions the
// forms across the app already use. Read-only "list_*" tools exist so the model
// can resolve a name it was given in chat ("log an expense against Orex") into
// the Notion page ID a create_* tool actually needs.

import * as notion from "./notion";
import {
  setGreetingOverride,
  setScheduleOverride,
  setMetricOverride,
  setFocusOverride,
  clearUiOverride,
} from "./uiOverrides";
import { buildTodayView, describeUiState } from "./uiState";

export const ASSISTANT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_companies",
      description: "List all companies (id + name) — call this before using a companyId in another tool.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_accounts",
      description: "List all bank/investment/cash/credit accounts (id, name, type, balance, currency).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all projects (id, name, companyId, status).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "List all clients (id, name, companyId, relationship).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Add a task/to-do, optionally linked to a project and with a due date.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          projectId: { type: "string", description: "Notion page id from list_projects, optional" },
          status: { type: "string", enum: ["Backlog", "In Progress", "Done", "Blocked"] },
          dueDate: { type: "string", description: "YYYY-MM-DD, optional" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Create a new project, optionally under a company.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          companyId: { type: "string", description: "Notion page id from list_companies, optional" },
          status: { type: "string", enum: ["Idea", "Planning", "Production", "Rendering-Ready", "Delivered"] },
          description: { type: "string" },
          deadline: { type: "string", description: "YYYY-MM-DD, optional" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "Log an expense. Defaults to LKR. If accountId is given, that account's balance is debited automatically.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["Subscription", "Software", "Fuel", "Salary", "Rent", "Donation", "Other"] },
          amount: { type: "number" },
          currency: { type: "string", enum: ["LKR", "USD"] },
          date: { type: "string", description: "YYYY-MM-DD, optional, defaults to today" },
          recurring: { type: "boolean" },
          companyId: { type: "string", description: "Notion page id from list_companies, optional" },
          accountId: { type: "string", description: "Notion page id from list_accounts, optional" },
          notes: { type: "string" },
        },
        required: ["name", "category", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_income",
      description: "Log income. Defaults to LKR. If accountId is given, that account's balance is credited automatically.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          source: { type: "string", enum: ["Client Payment", "Salary", "Freelance", "Investment", "Gift", "Donation Received", "Other"] },
          amount: { type: "number" },
          currency: { type: "string" },
          date: { type: "string" },
          recurring: { type: "boolean" },
          companyId: { type: "string" },
          accountId: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name", "source", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_payment",
      description: "Track a new client payment/invoice (what they owe you). Use mark_payment_paid once it's actually paid.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string" },
          clientId: { type: "string", description: "Notion page id from list_clients, optional" },
          projectId: { type: "string", description: "Notion page id from list_projects, optional" },
          amount: { type: "number" },
          dueDate: { type: "string" },
          status: { type: "string", enum: ["Pending", "Partially Paid", "Paid", "Overdue"] },
        },
        required: ["label", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Add a new client.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          country: { type: "string" },
          companyId: { type: "string" },
          relationship: { type: "string", enum: ["Lead", "Active", "VIP", "Past"] },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_finance_goal",
      description: "Add a finance goal (savings target), optionally linked to an account and/or project.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" },
          type: { type: "string", enum: ["Personal", "Company"] },
          targetAmount: { type: "number" },
          currentAmount: { type: "number" },
          deadline: { type: "string" },
          linkedCompanyId: { type: "string" },
          linkedAccountId: { type: "string" },
          linkedProjectId: { type: "string" },
        },
        required: ["goal", "targetAmount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_wishlist_item",
      description: "Add an item to the buying/wishlist list.",
      parameters: {
        type: "object",
        properties: {
          item: { type: "string" },
          category: { type: "string" },
          estimatedCost: { type: "number" },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
        },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_idea",
      description: "Capture a quick idea in the Ideas Inbox.",
      parameters: {
        type: "object",
        properties: {
          idea: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["Now", "Later", "Someday"] },
        },
        required: ["idea"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_daily_log",
      description: "Log today's mood/energy/notes.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
          moodScore: { type: "number" },
          energyLevel: { type: "string" },
          notes: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_team_member",
      description: "Add a team member.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          companyId: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          status: { type: "string", enum: ["Active", "Inactive"] },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_account",
      description: "Add a bank/investment/cash/credit-card account to track.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["Bank", "Investment", "Cash", "Credit Card", "Other"] },
          balance: { type: "number" },
          currency: { type: "string" },
          institution: { type: "string" },
        },
        required: ["name", "balance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_payment_paid",
      description: "Mark a payment as paid — also auto-logs a matching Income entry linked back to it.",
      parameters: {
        type: "object",
        properties: { paymentId: { type: "string", description: "Notion page id, from list of overdue/pending payments the user mentioned" } },
        required: ["paymentId"],
      },
    },
  },
  /* ---------------------------------------------------------------- */
  /* Live UI control — the four tools that change what is on screen.    */
  /*                                                                    */
  /* These are display-state tools, scoped to today and reset tomorrow. */
  /* They are separated from the create_* tools above because they do   */
  /* NOT write to Notion, and the difference matters when the user asks */
  /* "did that save?" — a greeting change did not; a task did.          */
  /* ---------------------------------------------------------------- */
  {
    type: "function",
    function: {
      name: "get_dashboard_state",
      description:
        "Re-read the Today dashboard exactly as it is rendered right now, including any overrides already in place. " +
        "The current state is already in your system prompt — call this only AFTER you change something, to confirm " +
        "the new value took, or if the user says the screen disagrees with what you were told.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_dashboard_greeting",
      description:
        "Replace the greeting line at the top of the Today dashboard for the rest of today. Use when the user says the " +
        "greeting is wrong for their situation (working nights, a Poya day the app missed, wrong name or title). " +
        "It resets to the calculated greeting tomorrow. Keep the Sinhala opener unless the user asked otherwise.",
      parameters: {
        type: "object",
        properties: {
          newGreeting: { type: "string", description: "The full line as it should read, e.g. 'Ayubowan Achintha CEO'" },
          reason: { type: "string", description: "Why it changed — shown on the dashboard next to the flag" },
        },
        required: ["newGreeting", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_daily_schedule",
      description:
        "Replace today's time blocks in the plan panel. This REPLACES the whole plan, so include every block the day " +
        "should have, not just the one being moved — read the calendarPlan in your context first and resend it with " +
        "your edit applied. Times are the user's local wall clock. Pass taskId for a block that corresponds to an " +
        "existing task so its checkbox still writes through to Notion. Resets to the hora allocator tomorrow.",
      parameters: {
        type: "object",
        properties: {
          timeBlocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                start: { type: "string", description: "HH:MM, 24-hour, user's local time" },
                end: { type: "string", description: "HH:MM, 24-hour, user's local time" },
                note: { type: "string", description: "One line on why this block exists" },
                taskId: { type: "string", description: "Notion task id from calendarPlan, when this block is that task" },
              },
              required: ["title", "start", "end"],
            },
          },
          reason: { type: "string", description: "Why the plan was re-laid — shown under the panel heading" },
        },
        required: ["timeBlocks", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_metrics_and_goals",
      description:
        "Correct a metric card's headline figure, or move a finance goal. Metric keys are 'predictable', 'current', " +
        "'projects', 'tasks', 'payments', 'capacity' — those are DISPLAY overrides for today only, and the card is " +
        "marked 'manual' on screen because the figure is no longer a calculation. To change a finance goal instead, " +
        "pass key='goal:<notion page id>' with a number — that writes to Notion and is permanent. " +
        "Prefer fixing the underlying record over overriding a card; only override when the user explicitly wants the " +
        "displayed number changed.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "A metric card key, or 'goal:<id>' for a finance goal" },
          value: { type: "string", description: "The value to show, formatted as it should appear ('$14.2k', '5 due'), or a plain number for a goal" },
          note: { type: "string", description: "Shown in the card's footer instead of 'Set manually'" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resynthesize_day_analysis",
      description:
        "Rebuild the day's synthesis from the live astronomy and workload. Call with no arguments to recompute and " +
        "report what changed since the page loaded. Pass focusOverride to pin what the day should be built around — " +
        "that line is promoted to the top of the synthesis reasons; the calculated reasons stay underneath, unchanged.",
      parameters: {
        type: "object",
        properties: {
          focusOverride: { type: "string", description: "What today should be built around, e.g. 'closing the Vista invoice'" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_dashboard_override",
      description:
        "Undo a manual dashboard change and put the calculated value back. Use when the user says the real number/plan " +
        "should return, rather than asking them to type the computed value in by hand.",
      parameters: {
        type: "object",
        properties: {
          what: { type: "string", enum: ["greeting", "schedule", "focus", "metrics", "all"] },
          metricKey: { type: "string", description: "Which metric card, when what='metrics'. Omit to clear them all." },
        },
        required: ["what"],
      },
    },
  },
] as const;

/** Tools that touch display state only — they work with Notion disconnected. */
export const UI_TOOLS = new Set([
  "get_dashboard_state",
  "update_dashboard_greeting",
  "modify_daily_schedule",
  "resynthesize_day_analysis",
  "clear_dashboard_override",
]);

/** Tools whose effect the user can see without a reload once the page revalidates. */
export const MUTATES_UI = new Set([
  "update_dashboard_greeting",
  "modify_daily_schedule",
  "update_metrics_and_goals",
  "resynthesize_day_analysis",
  "clear_dashboard_override",
]);

export async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "list_companies": {
      const rows = await notion.getCompanies();
      return rows.map((c) => ({ id: c.id, name: c.name, type: c.type }));
    }
    case "list_accounts": {
      const rows = await notion.getAccounts();
      return rows.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance, currency: a.currency }));
    }
    case "list_projects": {
      const rows = await notion.getProjects();
      return rows.map((p) => ({ id: p.id, name: p.name, companyId: p.companyId, status: p.status }));
    }
    case "list_clients": {
      const rows = await notion.getClients();
      return rows.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId, relationship: c.relationship }));
    }
    case "create_task":
      return { ok: true, page: await notion.createTask(args) };
    case "create_project":
      return { ok: true, page: await notion.createProject(args) };
    case "create_expense":
      return { ok: true, page: await notion.createExpense(args) };
    case "create_income":
      return { ok: true, page: await notion.createIncome(args) };
    case "create_payment":
      return { ok: true, page: await notion.createPayment(args) };
    case "create_client":
      return { ok: true, page: await notion.createClient(args) };
    case "create_finance_goal":
      return { ok: true, page: await notion.createFinanceGoal(args) };
    case "create_wishlist_item":
      return { ok: true, page: await notion.createWishlistItem(args) };
    case "create_idea":
      return { ok: true, page: await notion.createIdea(args) };
    case "create_daily_log":
      return { ok: true, page: await notion.createDailyLog({ date: args.date || new Date().toISOString().slice(0, 10), ...args }) };
    case "create_team_member":
      return { ok: true, page: await notion.createTeamMember(args) };
    case "create_account":
      return { ok: true, page: await notion.createAccount(args) };
    case "mark_payment_paid": {
      const [payments, projects] = await Promise.all([notion.getPayments(), notion.getProjects()]);
      const payment = payments.find((p) => p.id === args.paymentId);
      if (!payment) return { ok: false, error: "Payment not found — call list-relevant tool or ask the user for the exact payment." };
      const companyId = payment.projectId ? projects.find((p) => p.id === payment.projectId)?.companyId : undefined;
      await notion.markPaymentPaid(args.paymentId, { label: payment.label, amount: payment.amount, companyId });
      return { ok: true };
    }
    /* ---------------- live UI control ---------------- */
    case "get_dashboard_state": {
      const view = await buildTodayView();
      return { ok: true, state: describeUiState(view) };
    }
    case "update_dashboard_greeting": {
      const line = String(args.newGreeting || "").trim();
      if (!line) return { ok: false, error: "newGreeting was empty — nothing to show." };
      if (line.length > 120) return { ok: false, error: "That greeting is too long for the header — keep it under 120 characters." };
      await setGreetingOverride(line, String(args.reason || "Set from chat"));
      return { ok: true, greeting: line, scope: "today only; resets tomorrow" };
    }
    case "modify_daily_schedule": {
      const raw = Array.isArray(args.timeBlocks) ? args.timeBlocks : [];
      if (!raw.length) return { ok: false, error: "timeBlocks was empty. To clear the plan use clear_dashboard_override." };
      const bad: string[] = [];
      const blocks = raw.map((b: any) => {
        const start = String(b?.start || "");
        const end = String(b?.end || "");
        // A block that fails to parse would silently render at 9am, which is
        // worse than refusing: the user would see a plan they never asked for.
        if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) bad.push(`${b?.title || "block"} (${start}-${end})`);
        return {
          title: String(b?.title || "Untitled block"),
          start,
          end,
          note: b?.note ? String(b.note) : undefined,
          taskId: b?.taskId ? String(b.taskId) : undefined,
        };
      });
      if (bad.length) return { ok: false, error: `Times must be HH:MM on a 24-hour clock. Bad: ${bad.join(", ")}` };
      await setScheduleOverride(blocks, String(args.reason || "Re-laid from chat"));
      return { ok: true, blocks: blocks.length, scope: "today only; the hora allocator takes over again tomorrow" };
    }
    case "update_metrics_and_goals": {
      const key = String(args.key || "");
      if (key.startsWith("goal:")) {
        const id = key.slice(5);
        const amount = Number(String(args.value).replace(/[^0-9.-]/g, ""));
        if (!Number.isFinite(amount)) return { ok: false, error: "A finance goal needs a number." };
        const goals = await notion.getFinanceGoals();
        const goal = goals.find((g) => g.id === id);
        if (!goal) return { ok: false, error: "No finance goal with that id — the ids are in your dashboard context." };
        await notion.updateFinanceGoal(id, { currentAmount: amount });
        return { ok: true, goal: goal.goal, currentAmount: amount, written: "Notion — permanent" };
      }
      const allowed = ["predictable", "current", "projects", "tasks", "payments", "capacity"];
      if (!allowed.includes(key)) {
        return { ok: false, error: `Unknown metric key "${key}". Valid keys: ${allowed.join(", ")}, or goal:<id>.` };
      }
      await setMetricOverride(key, String(args.value), args.note ? String(args.note) : undefined);
      return {
        ok: true,
        key,
        display: String(args.value),
        scope: "today only; the card is flagged 'manual' on screen because it is no longer derived",
      };
    }
    case "resynthesize_day_analysis": {
      if (args.focusOverride) await setFocusOverride(String(args.focusOverride));
      const view = await buildTodayView();
      return {
        ok: true,
        score: view.energy.score,
        verdict: view.energy.verdict,
        headline: view.energy.headline,
        reasons: view.energy.reasons,
        deepWork: view.energy.deepWork
          ? { start: view.energy.deepWork.start, end: view.energy.deepWork.end, planets: view.energy.deepWork.planets }
          : null,
        rest: view.energy.rest ? { start: view.energy.rest.start, end: view.energy.rest.end } : null,
        capacity: view.capacity.label,
      };
    }
    case "clear_dashboard_override": {
      const what = String(args.what || "");
      if (!["greeting", "schedule", "focus", "metrics", "all"].includes(what)) {
        return { ok: false, error: "what must be greeting, schedule, focus, metrics or all." };
      }
      await clearUiOverride(what as any, args.metricKey ? String(args.metricKey) : undefined);
      return { ok: true, cleared: what, note: "The calculated value is back on screen." };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
