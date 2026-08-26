// The tool surface for the floating Assistant widget (components/ChatWidget.tsx)
// and its API route (app/api/assistant/route.ts). Every mutating tool here is a
// thin pass-through to an existing lib/notion.ts create*/start*/end* function —
// no new write paths, just an AI-callable front door onto the same functions the
// forms across the app already use. Read-only "list_*" tools exist so the model
// can resolve a name it was given in chat ("log an expense against Orex") into
// the Notion page ID a create_* tool actually needs.

import * as notion from "./notion";

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
] as const;

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
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
