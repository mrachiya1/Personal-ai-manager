// Thin, dependency-free Notion API client (plain fetch, no @notionhq/client)
// pinned to a stable API version so it doesn't drift under you.
//
// The credentials are resolved PER REQUEST (lib/userConfig.ts): a signed-in
// user's own Notion token and database IDs win, falling back to NOTION_API_KEY
// in .env.local so a single-user install keeps working with no sign-in at all.
//
// Either way it needs an "internal integration" secret
// from notion.so/my-integrations, with the "Personal ai assistant" page
// (and everything under it) shared with that integration in Notion's UI
// (••• menu → Connections → your integration). Without that share step the
// API key alone will get 404s, even though it's valid.

import type {
  Company,
  CoreRule,
  Project,
  Task,
  ClientRecord,
  Payment,
  Idea,
  LearningTopic,
  FinanceGoal,
  WishlistItem,
  DailyLog,
  AstroEvent,
  SleepLog,
  TeamMember,
  Expense,
  Account,
  Income,
} from "./types";
import { cache } from "react";
import { getDbMap, getNotionToken, DEFAULT_DB } from "./userConfig";

const NOTION_VERSION = "2022-06-28";
// Overridable so the app can be pointed at a stand-in Notion during UI work
// and testing. Unset in every real environment, where it is the live API.
const BASE_URL = process.env["NOTION_API_BASE_URL"] || "https://api.notion.com/v1";

// Database IDs and the API key are resolved per request from the current
// user's saved configuration, falling back to env. `dbMap()` and `notionKey()`
// are React-cached upstream, so calling them once per query is cheap.
const dbMap = getDbMap;

/** Legacy export kept for compatibility: the install-wide default IDs. */
export const DB = DEFAULT_DB;

/** Whether the *current user* has a usable Notion connection. */
export async function notionConnected(): Promise<boolean> {
  return Boolean(await getNotionToken());
}


class NotionError extends Error {}

async function notionFetch(path: string, init: RequestInit = {}) {
  const NOTION_API_KEY = await getNotionToken();
  if (!NOTION_API_KEY) {
    throw new NotionError(
      "No Notion connection — connect your workspace on the Settings page (or set NOTION_API_KEY in .env.local)."
    );
  }

  // A write aimed at an unmapped database would otherwise go out as
  // `"database_id":""` and come back as an opaque Notion 400. Catch it here
  // and say the useful thing instead.
  if (typeof init.body === "string" && init.body.includes('"database_id":""')) {
    throw new NotionError(
      "That database isn't mapped yet — open Settings → Notion and point it at a database in your workspace."
    );
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    // Notion data changes by the minute at most (daily plan, payments) —
    // avoid Next's aggressive fetch caching so the dashboard stays fresh.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NotionError(`Notion API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Which database keys are configured for this request's user. Cheap: no I/O. */
export async function unmappedDatabases(): Promise<string[]> {
  const map = await getDbMap();
  return Object.entries(map)
    .filter(([, id]) => !id)
    .map(([key]) => key);
}

async function queryAll(databaseId: string, body: Record<string, unknown> = {}) {
  // An unmapped database reads as empty rather than exploding. A brand-new
  // user has connected their Notion token but not yet pointed the app at any
  // of their databases; every tab 500-ing at that moment would be a terrible
  // first five minutes, and there is nothing wrong that the user can't fix
  // from Settings — where a banner sends them.
  if (!databaseId) return [];

  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const page: any = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...body, start_cursor: cursor }),
    });
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

// ---- property extraction helpers ----
function title(props: any, key: string): string {
  return props?.[key]?.title?.map((t: any) => t.plain_text).join("") ?? "";
}
function richText(props: any, key: string): string {
  return props?.[key]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
}
function select(props: any, key: string): string | undefined {
  return props?.[key]?.select?.name;
}
function multiSelect(props: any, key: string): string[] {
  return props?.[key]?.multi_select?.map((o: any) => o.name) ?? [];
}
function num(props: any, key: string): number | undefined {
  return props?.[key]?.number ?? undefined;
}
function checkbox(props: any, key: string): boolean {
  return Boolean(props?.[key]?.checkbox);
}
function dateStart(props: any, key: string): string | undefined {
  return props?.[key]?.date?.start ?? undefined;
}
function email(props: any, key: string): string | undefined {
  return props?.[key]?.email ?? undefined;
}
function phone(props: any, key: string): string | undefined {
  return props?.[key]?.phone_number ?? undefined;
}
/** Notion returns uploaded files and pasted links in the same array, shaped differently. */
function files(props: any, key: string): { name: string; url: string; kind: "file" | "external" }[] {
  const list = props?.[key]?.files;
  if (!Array.isArray(list)) return [];
  return list
    .map((f: any) => ({
      name: f?.name || "Untitled",
      url: f?.file?.url || f?.external?.url || "",
      kind: (f?.type === "external" ? "external" : "file") as "file" | "external",
    }))
    .filter((f: { url: string }) => f.url);
}

function relationIds(props: any, key: string): string[] {
  return props?.[key]?.relation?.map((r: any) => r.id) ?? [];
}

const COLOR_CYCLE = ["--blue", "--orange", "--aqua", "--violet", "--magenta", "--yellow"] as const;
function colorForIndex(i: number) {
  return COLOR_CYCLE[i % COLOR_CYCLE.length];
}

// ---- typed fetchers ----

async function _getCompanies(): Promise<Company[]> {
  const pages = await queryAll((await dbMap()).companies);
  return pages.map((p, i) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    type: (select(p.properties, "Type") as Company["type"]) || "Other",
    startDate: dateStart(p.properties, "Start Date"),
    goals: richText(p.properties, "Goals"),
    description: richText(p.properties, "Description"),
    monthlyRevenueTarget: num(p.properties, "Monthly Revenue Target"),
    plan: richText(p.properties, "Plan / To-Dos"),
    colorVar: colorForIndex(i),
  }));
}

export async function createCompany(input: {
  name: string;
  type?: string;
  startDate?: string;
  goals?: string;
  description?: string;
  monthlyRevenueTarget?: number;
  plan?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).companies },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        Type: { select: { name: input.type || "Other" } },
        ...(input.startDate ? { "Start Date": { date: { start: input.startDate } } } : {}),
        ...(input.goals !== undefined ? { Goals: { rich_text: [{ text: { content: input.goals } }] } } : {}),
        ...(input.description !== undefined
          ? { Description: { rich_text: [{ text: { content: input.description } }] } }
          : {}),
        ...(input.monthlyRevenueTarget !== undefined
          ? { "Monthly Revenue Target": { number: input.monthlyRevenueTarget } }
          : {}),
        ...(input.plan !== undefined ? { "Plan / To-Dos": { rich_text: [{ text: { content: input.plan } }] } } : {}),
      },
    }),
  });
}

export async function updateCompany(
  id: string,
  input: Partial<{
    name: string;
    type: string;
    startDate: string;
    goals: string;
    description: string;
    monthlyRevenueTarget: number;
    plan: string;
  }>
) {
  const properties: Record<string, unknown> = {};
  if (input.name !== undefined) properties.Name = { title: [{ text: { content: input.name } }] };
  if (input.type !== undefined) properties.Type = { select: { name: input.type } };
  if (input.startDate !== undefined) properties["Start Date"] = { date: { start: input.startDate } };
  if (input.goals !== undefined) properties.Goals = { rich_text: [{ text: { content: input.goals } }] };
  if (input.description !== undefined)
    properties.Description = { rich_text: [{ text: { content: input.description } }] };
  if (input.monthlyRevenueTarget !== undefined)
    properties["Monthly Revenue Target"] = { number: input.monthlyRevenueTarget };
  if (input.plan !== undefined) properties["Plan / To-Dos"] = { rich_text: [{ text: { content: input.plan } }] };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function getCoreRules(): Promise<CoreRule[]> {
  const pages = await queryAll((await dbMap()).coreRules, {
    filter: { property: "Active", checkbox: { equals: true } },
  });
  return pages.map((p) => ({
    id: p.id,
    rule: title(p.properties, "Rule"),
    category: (select(p.properties, "Category") as CoreRule["category"]) || "Personal Pattern",
    condition: richText(p.properties, "Condition"),
    guidance: richText(p.properties, "Guidance"),
    active: checkbox(p.properties, "Active"),
    appliesToCompanyId: relationIds(p.properties, "Applies To")[0],
  }));
}

async function _getProjects(): Promise<Project[]> {
  const pages = await queryAll((await dbMap()).projects);
  return pages.map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    companyId: relationIds(p.properties, "Company")[0] || "",
    // "Client" is one of the properties added by lib/projectSchema.ts. On a
    // database that predates it this reads as undefined, and callers fall
    // back to joining through Payments (Payment.projectId -> clientId).
    clientId: relationIds(p.properties, "Client")[0] || undefined,
    category: multiSelect(p.properties, "Category"),
    status: (select(p.properties, "Status") as Project["status"]) || "Idea",
    description: richText(p.properties, "Description"),
    deadline: dateStart(p.properties, "Deadline"),
    renderPriority: select(p.properties, "Render Priority") as Project["renderPriority"],
    estimatedRenderHours: num(p.properties, "Estimated Render Time (hrs)"),

    assignedTo: relationIds(p.properties, "Assigned To"),
    startDate: dateStart(p.properties, "Start Date"),
    value: num(p.properties, "Value"),
    headline: richText(p.properties, "Headline") || undefined,
    clientRequests: richText(p.properties, "Client Requests") || undefined,
    lastReviewed: dateStart(p.properties, "Last Reviewed"),
    reviewedBy: relationIds(p.properties, "Reviewed By"),
    // Notion maintains this on every page; no property to create.
    lastEditedTime: p.last_edited_time,
    files: files(p.properties, "Files"),
  }));
}

export interface ProjectUpdate {
  name: string;
  companyId: string;
  clientId: string;
  status: string;
  description: string;
  deadline: string;
  startDate: string;
  renderPriority: string;
  estimatedRenderHours: number;
  category: string[];
  assignedTo: string[];
  value: number;
  headline: string;
  clientRequests: string;
  lastReviewed: string;
  reviewedBy: string[];
}

/**
 * Turns a partial project into Notion page properties.
 *
 * Shared by create and update so a field can never be editable in the table
 * but silently dropped by the New Project form — which is exactly what
 * happened when the two built their properties separately: a project created
 * from the form had no client, so it landed outside every folder.
 *
 * A key that is absent is left untouched; a key present but empty clears the
 * field, which in Notion means an empty rich_text array or a null date, not
 * the string "". Getting that wrong writes the literal text "undefined" into
 * people's databases.
 */
function projectProperties(input: Partial<ProjectUpdate>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const text = (v: string) => ({ rich_text: v ? [{ text: { content: v } }] : [] });
  const date = (v: string) => ({ date: v ? { start: v } : null });
  const rel = (ids: string[]) => ({ relation: ids.filter(Boolean).map((rid) => ({ id: rid })) });

  if (input.name !== undefined) properties.Name = { title: [{ text: { content: input.name } }] };
  if (input.companyId !== undefined) properties.Company = rel(input.companyId ? [input.companyId] : []);
  if (input.clientId !== undefined) properties.Client = rel(input.clientId ? [input.clientId] : []);
  if (input.status !== undefined) properties.Status = { select: { name: input.status } };
  if (input.description !== undefined) properties.Description = text(input.description);
  if (input.deadline !== undefined) properties.Deadline = date(input.deadline);
  if (input.startDate !== undefined) properties["Start Date"] = date(input.startDate);
  if (input.renderPriority !== undefined) {
    properties["Render Priority"] = input.renderPriority ? { select: { name: input.renderPriority } } : { select: null };
  }
  if (input.estimatedRenderHours !== undefined)
    properties["Estimated Render Time (hrs)"] = { number: input.estimatedRenderHours };
  if (input.category !== undefined)
    properties.Category = { multi_select: input.category.filter(Boolean).map((name) => ({ name })) };
  if (input.assignedTo !== undefined) properties["Assigned To"] = rel(input.assignedTo);
  if (input.value !== undefined) properties.Value = { number: Number.isFinite(input.value) ? input.value : null };
  if (input.headline !== undefined) properties.Headline = text(input.headline);
  if (input.clientRequests !== undefined) properties["Client Requests"] = text(input.clientRequests);
  if (input.lastReviewed !== undefined) properties["Last Reviewed"] = date(input.lastReviewed);
  if (input.reviewedBy !== undefined) properties["Reviewed By"] = rel(input.reviewedBy);

  return properties;
}

export async function createProject(input: Partial<ProjectUpdate> & { name: string }) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).projects },
      // A brand-new page has no status at all, so default it rather than
      // creating something that shows up nowhere on the board.
      properties: projectProperties({ status: "Idea", ...input }),
    }),
  });
}

export async function updateProject(id: string, input: Partial<ProjectUpdate>) {
  return notionFetch(`/pages/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: projectProperties(input) }),
  });
}

async function _getTasks(): Promise<Task[]> {
  const pages = await queryAll((await dbMap()).tasks);
  return pages.map((p) => ({
    id: p.id,
    title: title(p.properties, "Title"),
    projectId: relationIds(p.properties, "Project")[0] || "",
    status: (select(p.properties, "Status") as Task["status"]) || "Backlog",
    dueDate: dateStart(p.properties, "Due Date"),
    tags: multiSelect(p.properties, "Tags"),
  }));
}

export async function createTask(input: {
  title: string;
  projectId?: string;
  status?: string;
  dueDate?: string;
  tags?: string[];
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).tasks },
      properties: {
        Title: { title: [{ text: { content: input.title } }] },
        ...(input.projectId ? { Project: { relation: [{ id: input.projectId }] } } : {}),
        Status: { select: { name: input.status || "Backlog" } },
        ...(input.dueDate ? { "Due Date": { date: { start: input.dueDate } } } : {}),
        ...(input.tags && input.tags.length ? { Tags: { multi_select: input.tags.map((t) => ({ name: t })) } } : {}),
      },
    }),
  });
}

/**
 * Updates one task. Used by the checklist inside a project row, where ticking
 * an item has to write straight back to the Tasks database — a checklist that
 * only pretends to save is worse than no checklist.
 */
export async function updateTask(
  id: string,
  input: Partial<{ title: string; status: string; dueDate: string; projectId: string }>
) {
  const properties: Record<string, unknown> = {};
  if (input.title !== undefined) properties.Title = { title: [{ text: { content: input.title } }] };
  if (input.status !== undefined) properties.Status = { select: { name: input.status } };
  if (input.dueDate !== undefined) properties["Due Date"] = { date: input.dueDate ? { start: input.dueDate } : null };
  if (input.projectId !== undefined)
    properties.Project = { relation: input.projectId ? [{ id: input.projectId }] : [] };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function getClients(): Promise<ClientRecord[]> {
  const pages = await queryAll((await dbMap()).clients);
  return pages.map((p, i) => {
    const name = title(p.properties, "Name");
    return {
      id: p.id,
      name,
      email: email(p.properties, "Email"),
      phone: phone(p.properties, "Phone"),
      country: richText(p.properties, "Country"),
      companyId: relationIds(p.properties, "Company")[0] || "",
      relationship: (select(p.properties, "Relationship") as ClientRecord["relationship"]) || "Lead",
      preferredContact: richText(p.properties, "Preferred Contact"),
      notes: richText(p.properties, "Notes"),
      avatarInitial: name.charAt(0).toUpperCase() || "?",
      avatarGradient: `linear-gradient(155deg, var(${colorForIndex(i)}), #1c1c1a)`,
    };
  });
}

export async function createClient(input: {
  name: string;
  email?: string;
  phone?: string;
  country?: string;
  companyId?: string;
  relationship?: string;
  preferredContact?: string;
  notes?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).clients },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        ...(input.email ? { Email: { email: input.email } } : {}),
        ...(input.phone ? { Phone: { phone_number: input.phone } } : {}),
        ...(input.country ? { Country: { rich_text: [{ text: { content: input.country } }] } } : {}),
        ...(input.companyId ? { Company: { relation: [{ id: input.companyId }] } } : {}),
        Relationship: { select: { name: input.relationship || "Lead" } },
        ...(input.preferredContact
          ? { "Preferred Contact": { rich_text: [{ text: { content: input.preferredContact } }] } }
          : {}),
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
}

export async function getPayments(): Promise<Payment[]> {
  const pages = await queryAll((await dbMap()).payments);
  return pages.map((p) => ({
    id: p.id,
    label: title(p.properties, "Label"),
    clientId: relationIds(p.properties, "Client")[0] || "",
    projectId: relationIds(p.properties, "Project")[0],
    amount: num(p.properties, "Amount") || 0,
    dueDate: dateStart(p.properties, "Due Date"),
    paidDate: dateStart(p.properties, "Paid Date"),
    status: (select(p.properties, "Status") as Payment["status"]) || "Pending",
    linkedIncomeId: relationIds(p.properties, "Linked Income")[0],
  }));
}

export async function createPayment(input: {
  label: string;
  clientId?: string;
  projectId?: string;
  amount: number;
  dueDate?: string;
  status?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).payments },
      properties: {
        Label: { title: [{ text: { content: input.label } }] },
        ...(input.clientId ? { Client: { relation: [{ id: input.clientId }] } } : {}),
        ...(input.projectId ? { Project: { relation: [{ id: input.projectId }] } } : {}),
        Amount: { number: input.amount },
        ...(input.dueDate ? { "Due Date": { date: { start: input.dueDate } } } : {}),
        Status: { select: { name: input.status || "Pending" } },
      },
    }),
  });
}

export async function updatePayment(
  id: string,
  input: Partial<{ label: string; clientId: string; projectId: string; amount: number; dueDate: string; paidDate: string; status: string }>
) {
  const properties: Record<string, unknown> = {};
  if (input.label !== undefined) properties.Label = { title: [{ text: { content: input.label } }] };
  if (input.clientId !== undefined) properties.Client = { relation: [{ id: input.clientId }] };
  if (input.projectId !== undefined) properties.Project = { relation: [{ id: input.projectId }] };
  if (input.amount !== undefined) properties.Amount = { number: input.amount };
  if (input.dueDate !== undefined) properties["Due Date"] = { date: { start: input.dueDate } };
  if (input.paidDate !== undefined) properties["Paid Date"] = { date: { start: input.paidDate } };
  if (input.status !== undefined) properties.Status = { select: { name: input.status } };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

/**
 * Marks a Payment as Paid and — this is the "link Payments and Income
 * together" piece — creates a matching Income entry (Source: "Client
 * Payment") pointing back at it via the "Linked Income" <-> "Linked Payment"
 * relation, so the money shows up in both places instead of living twice
 * with no connection. Optionally credits an Account's balance too, same as
 * any other income.
 */
export async function markPaymentPaid(
  paymentId: string,
  input: { label: string; amount: number; companyId?: string; accountId?: string; paidDate?: string }
) {
  const paidDate = input.paidDate || new Date().toISOString().slice(0, 10);
  const incomePage: any = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).income },
      properties: {
        Name: { title: [{ text: { content: input.label } }] },
        Source: { select: { name: "Client Payment" } },
        Amount: { number: input.amount },
        Currency: { rich_text: [{ text: { content: "LKR" } }] },
        Date: { date: { start: paidDate } },
        Recurring: { checkbox: false },
        ...(input.companyId ? { Company: { relation: [{ id: input.companyId }] } } : {}),
        ...(input.accountId ? { Account: { relation: [{ id: input.accountId }] } } : {}),
        "Linked Payment": { relation: [{ id: paymentId }] },
      },
    }),
  });
  if (input.accountId) {
    await adjustAccountBalance(input.accountId, Math.abs(input.amount));
  }
  await notionFetch(`/pages/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Status: { select: { name: "Paid" } },
        "Paid Date": { date: { start: paidDate } },
        "Linked Income": { relation: [{ id: incomePage.id }] },
      },
    }),
  });
  return incomePage;
}

export async function getIdeas(): Promise<Idea[]> {
  const pages = await queryAll((await dbMap()).ideas, { sorts: [{ timestamp: "created_time", direction: "descending" }] });
  return pages.map((p) => ({
    id: p.id,
    idea: title(p.properties, "Idea"),
    description: richText(p.properties, "Description"),
    tags: multiSelect(p.properties, "Tags"),
    linkedCompanyId: relationIds(p.properties, "Linked Company")[0],
    linkedProjectId: relationIds(p.properties, "Linked Project")[0],
    priority: (select(p.properties, "Priority") as Idea["priority"]) || "Someday",
  }));
}

export async function getLearningTopics(): Promise<LearningTopic[]> {
  const pages = await queryAll((await dbMap()).learning);
  return pages.map((p) => ({
    id: p.id,
    topic: title(p.properties, "Topic"),
    description: richText(p.properties, "Description"),
    resources: richText(p.properties, "Resources"),
    progress: (select(p.properties, "Progress") as LearningTopic["progress"]) || "Not Started",
    sessionNotes: richText(p.properties, "Session Notes"),
    // Notion always carries created_time, no property needed — which is what
    // lets the dashboard show how long a topic has been open without asking
    // anyone to add a column first.
    createdTime: p.created_time,
    // Optional, read if the database happens to have them. A workspace
    // without these columns reads undefined and falls back to the coarse
    // status-derived percentage rather than breaking.
    completion: num(p.properties, "Completion"),
    targetDate: dateStart(p.properties, "Target Date"),
  }));
}

export async function createLearningTopic(input: {
  topic: string;
  description?: string;
  resources?: string;
  progress?: string;
  sessionNotes?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).learning },
      properties: {
        Topic: { title: [{ text: { content: input.topic } }] },
        ...(input.description ? { Description: { rich_text: [{ text: { content: input.description } }] } } : {}),
        ...(input.resources ? { Resources: { rich_text: [{ text: { content: input.resources } }] } } : {}),
        Progress: { select: { name: input.progress || "Not Started" } },
        ...(input.sessionNotes ? { "Session Notes": { rich_text: [{ text: { content: input.sessionNotes } }] } } : {}),
      },
    }),
  });
}

export async function updateLearningTopic(
  id: string,
  input: { progress?: string; completion?: number; sessionNotes?: string; targetDate?: string }
) {
  const properties: Record<string, unknown> = {};
  if (input.progress !== undefined) properties.Progress = { select: { name: input.progress } };
  if (input.completion !== undefined) properties.Completion = { number: input.completion };
  if (input.sessionNotes !== undefined) {
    properties["Session Notes"] = { rich_text: input.sessionNotes ? [{ text: { content: input.sessionNotes } }] : [] };
  }
  if (input.targetDate !== undefined) {
    properties["Target Date"] = { date: input.targetDate ? { start: input.targetDate } : null };
  }
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function getFinanceGoals(): Promise<FinanceGoal[]> {
  const pages = await queryAll((await dbMap()).financeGoals);
  return pages.map((p) => ({
    id: p.id,
    goal: title(p.properties, "Goal"),
    type: (select(p.properties, "Type") as FinanceGoal["type"]) || "Personal",
    targetAmount: num(p.properties, "Target Amount") || 0,
    currentAmount: num(p.properties, "Current Amount") || 0,
    deadline: dateStart(p.properties, "Deadline"),
    linkedCompanyId: relationIds(p.properties, "Linked Company")[0],
    linkedAccountId: relationIds(p.properties, "Linked Account")[0],
    linkedProjectId: relationIds(p.properties, "Linked Project")[0],
    createdTime: p.created_time,
  }));
}

export async function createFinanceGoal(input: {
  goal: string;
  type?: string;
  targetAmount: number;
  currentAmount?: number;
  deadline?: string;
  linkedCompanyId?: string;
  linkedAccountId?: string;
  linkedProjectId?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).financeGoals },
      properties: {
        Goal: { title: [{ text: { content: input.goal } }] },
        Type: { select: { name: input.type || "Personal" } },
        "Target Amount": { number: input.targetAmount },
        "Current Amount": { number: input.currentAmount ?? 0 },
        ...(input.deadline ? { Deadline: { date: { start: input.deadline } } } : {}),
        ...(input.linkedCompanyId ? { "Linked Company": { relation: [{ id: input.linkedCompanyId }] } } : {}),
        ...(input.linkedAccountId ? { "Linked Account": { relation: [{ id: input.linkedAccountId }] } } : {}),
        ...(input.linkedProjectId ? { "Linked Project": { relation: [{ id: input.linkedProjectId }] } } : {}),
      },
    }),
  });
}

export async function getWishlistItems(): Promise<WishlistItem[]> {
  const pages = await queryAll((await dbMap()).wishlist);
  return pages.map((p) => ({
    id: p.id,
    item: title(p.properties, "Item"),
    category: richText(p.properties, "Category"),
    estimatedCost: num(p.properties, "Estimated Cost"),
    priority: (select(p.properties, "Priority") as WishlistItem["priority"]) || "Medium",
  }));
}

export async function createWishlistItem(input: {
  item: string;
  category?: string;
  estimatedCost?: number;
  priority?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).wishlist },
      properties: {
        Item: { title: [{ text: { content: input.item } }] },
        ...(input.category ? { Category: { rich_text: [{ text: { content: input.category } }] } } : {}),
        ...(input.estimatedCost !== undefined ? { "Estimated Cost": { number: input.estimatedCost } } : {}),
        Priority: { select: { name: input.priority || "Medium" } },
      },
    }),
  });
}

export async function getDailyLogs(limit = 30): Promise<DailyLog[]> {
  const pages = await queryAll((await dbMap()).dailyLogs, {
    sorts: [{ property: "Log Date", direction: "descending" }],
  });
  return pages.slice(0, limit).map((p) => ({
    id: p.id,
    date: dateStart(p.properties, "Log Date") || "",
    moodScore: num(p.properties, "Mood Score"),
    energyLevel: select(p.properties, "Energy Level") as DailyLog["energyLevel"],
    notes: richText(p.properties, "Notes"),
    aiDailyPlan: richText(p.properties, "AI Daily Plan"),
  }));
}

export async function getSleepLogs(limit = 30): Promise<SleepLog[]> {
  const pages = await queryAll((await dbMap()).sleepLogs, {
    sorts: [{ property: "Sleep Time", direction: "descending" }],
  });
  return pages.slice(0, limit).map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    sleepTime: dateStart(p.properties, "Sleep Time"),
    wakeTime: dateStart(p.properties, "Wake Time"),
    durationHours: num(p.properties, "Duration (hrs)"),
    notes: richText(p.properties, "Notes"),
  }));
}

/** Finds the most recent Sleep Logs entry that has a Sleep Time but no Wake Time yet. */
export async function getOpenSleepLog(): Promise<SleepLog | null> {
  const pages = await queryAll((await dbMap()).sleepLogs, {
    filter: { property: "Wake Time", date: { is_empty: true } },
    sorts: [{ property: "Sleep Time", direction: "descending" }],
  });
  const p = pages[0];
  if (!p) return null;
  return {
    id: p.id,
    name: title(p.properties, "Name"),
    sleepTime: dateStart(p.properties, "Sleep Time"),
    wakeTime: undefined,
    notes: richText(p.properties, "Notes"),
  };
}

export async function startSleepLog(nowISO: string) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).sleepLogs },
      properties: {
        Name: { title: [{ text: { content: new Date(nowISO).toLocaleString() } }] },
        "Sleep Time": { date: { start: nowISO } },
      },
    }),
  });
}

export async function endSleepLog(pageId: string, sleepISO: string, wakeISO: string) {
  const hours = (new Date(wakeISO).getTime() - new Date(sleepISO).getTime()) / 3_600_000;
  return notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Wake Time": { date: { start: wakeISO } },
        "Duration (hrs)": { number: Math.round(hours * 100) / 100 },
      },
    }),
  });
}

/**
 * Writes a night you forgot to tap through.
 *
 * Duration is computed here rather than trusted from the form, so a manual
 * entry and a tapped one are calculated the same way and the averages on the
 * dashboard stay comparable. A wake time before the sleep time is rejected
 * rather than stored as a negative night.
 */
export async function createSleepLog(input: { sleepISO: string; wakeISO?: string; notes?: string }) {
  const hours = input.wakeISO
    ? (new Date(input.wakeISO).getTime() - new Date(input.sleepISO).getTime()) / 3_600_000
    : undefined;
  if (hours !== undefined && hours <= 0) {
    throw new Error("Wake time has to be after the sleep time.");
  }
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).sleepLogs },
      properties: {
        Name: { title: [{ text: { content: new Date(input.sleepISO).toLocaleString() } }] },
        "Sleep Time": { date: { start: input.sleepISO } },
        ...(input.wakeISO ? { "Wake Time": { date: { start: input.wakeISO } } } : {}),
        ...(hours !== undefined ? { "Duration (hrs)": { number: Math.round(hours * 100) / 100 } } : {}),
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
}

/**
 * Corrects an entry that is already there — a tap at the wrong moment, or a
 * manual entry with a typo. Fixing beats deleting and re-adding: the row
 * keeps its place in the history and nothing has to be retyped.
 */
export async function updateSleepLog(
  pageId: string,
  input: { sleepISO?: string; wakeISO?: string | null; notes?: string }
) {
  const properties: Record<string, unknown> = {};
  if (input.sleepISO) properties["Sleep Time"] = { date: { start: input.sleepISO } };
  if (input.wakeISO !== undefined) {
    properties["Wake Time"] = { date: input.wakeISO ? { start: input.wakeISO } : null };
  }
  if (input.notes !== undefined) {
    properties.Notes = { rich_text: input.notes ? [{ text: { content: input.notes } }] : [] };
  }
  // Recompute duration whenever either end moves, so it can never disagree
  // with the times sitting beside it.
  if (input.sleepISO && input.wakeISO) {
    const hours = (new Date(input.wakeISO).getTime() - new Date(input.sleepISO).getTime()) / 3_600_000;
    if (hours <= 0) throw new Error("Wake time has to be after the sleep time.");
    properties["Duration (hrs)"] = { number: Math.round(hours * 100) / 100 };
  } else if (input.wakeISO === null) {
    properties["Duration (hrs)"] = { number: null };
  }
  return notionFetch(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

/** Archives (soft-deletes) a mistaken Sleep Logs entry — e.g. an accidental tap that logged 0h. */
export async function deleteSleepLog(pageId: string) {
  return notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
}

export async function getAstroEvents(limit = 10): Promise<AstroEvent[]> {
  const pages = await queryAll((await dbMap()).astroEvents, {
    sorts: [{ property: "Event Date", direction: "descending" }],
  });
  return pages.slice(0, limit).map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    eventDate: dateStart(p.properties, "Event Date") || "",
    keyTransits: richText(p.properties, "Key Transits"),
    aiInterpretation: richText(p.properties, "AI Interpretation"),
  }));
}

// ---- writes (quick-capture flows) ----

export async function createIdea(input: {
  idea: string;
  description?: string;
  priority?: string;
  tags?: string[];
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).ideas },
      properties: {
        Idea: { title: [{ text: { content: input.idea } }] },
        ...(input.description
          ? { Description: { rich_text: [{ text: { content: input.description } }] } }
          : {}),
        Priority: { select: { name: input.priority || "Later" } },
        ...(input.tags?.length
          ? { Tags: { multi_select: input.tags.filter(Boolean).map((name) => ({ name })) } }
          : {}),
      },
    }),
  });
}

export async function createDailyLog(input: {
  date: string;
  moodScore?: number;
  energyLevel?: string;
  notes?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).dailyLogs },
      properties: {
        Name: { title: [{ text: { content: input.date } }] },
        "Log Date": { date: { start: input.date } },
        ...(input.moodScore !== undefined ? { "Mood Score": { number: input.moodScore } } : {}),
        ...(input.energyLevel ? { "Energy Level": { select: { name: input.energyLevel } } } : {}),
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const pages = await queryAll((await dbMap()).team);
  return pages.map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    role: richText(p.properties, "Role"),
    companyId: relationIds(p.properties, "Company")[0],
    email: email(p.properties, "Email"),
    phone: phone(p.properties, "Phone"),
    status: (select(p.properties, "Status") as TeamMember["status"]) || "Active",
    notes: richText(p.properties, "Notes"),
  }));
}

export async function createTeamMember(input: {
  name: string;
  role?: string;
  companyId?: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).team },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        ...(input.role ? { Role: { rich_text: [{ text: { content: input.role } }] } } : {}),
        ...(input.companyId ? { Company: { relation: [{ id: input.companyId }] } } : {}),
        ...(input.email ? { Email: { email: input.email } } : {}),
        ...(input.phone ? { Phone: { phone_number: input.phone } } : {}),
        Status: { select: { name: input.status || "Active" } },
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
}

export async function updateTeamMember(
  id: string,
  input: Partial<{ name: string; role: string; companyId: string; email: string; phone: string; status: string; notes: string }>
) {
  const properties: Record<string, unknown> = {};
  if (input.name !== undefined) properties.Name = { title: [{ text: { content: input.name } }] };
  if (input.role !== undefined) properties.Role = { rich_text: [{ text: { content: input.role } }] };
  if (input.companyId !== undefined) properties.Company = { relation: [{ id: input.companyId }] };
  if (input.email !== undefined) properties.Email = { email: input.email };
  if (input.phone !== undefined) properties.Phone = { phone_number: input.phone };
  if (input.status !== undefined) properties.Status = { select: { name: input.status } };
  if (input.notes !== undefined) properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function getExpenses(limit = 200): Promise<Expense[]> {
  const pages = await queryAll((await dbMap()).expenses, { sorts: [{ property: "Date", direction: "descending" }] });
  return pages.slice(0, limit).map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    category: (select(p.properties, "Category") as Expense["category"]) || "Other",
    amount: num(p.properties, "Amount") || 0,
    currency: (select(p.properties, "Currency") as Expense["currency"]) || "LKR",
    vendor: richText(p.properties, "Vendor"),
    date: dateStart(p.properties, "Date"),
    recurring: checkbox(p.properties, "Recurring"),
    companyId: relationIds(p.properties, "Company")[0],
    accountId: relationIds(p.properties, "Account")[0],
    notes: richText(p.properties, "Notes"),
  }));
}

export async function createExpense(input: {
  name: string;
  category: string;
  amount: number;
  currency?: string;
  vendor?: string;
  date?: string;
  recurring?: boolean;
  companyId?: string;
  accountId?: string;
  notes?: string;
}) {
  const page = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).expenses },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        Category: { select: { name: input.category } },
        Amount: { number: input.amount },
        Currency: { select: { name: input.currency || "LKR" } },
        ...(input.vendor ? { Vendor: { rich_text: [{ text: { content: input.vendor } }] } } : {}),
        Date: { date: { start: input.date || new Date().toISOString().slice(0, 10) } },
        Recurring: { checkbox: Boolean(input.recurring) },
        ...(input.companyId ? { Company: { relation: [{ id: input.companyId }] } } : {}),
        ...(input.accountId ? { Account: { relation: [{ id: input.accountId }] } } : {}),
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
  if (input.accountId) {
    await adjustAccountBalance(input.accountId, -Math.abs(input.amount));
  }
  return page;
}

export async function updateExpense(
  id: string,
  input: Partial<{
    name: string;
    category: string;
    amount: number;
    currency: string;
    vendor: string;
    date: string;
    recurring: boolean;
    companyId: string;
    notes: string;
  }>
) {
  const properties: Record<string, unknown> = {};
  if (input.name !== undefined) properties.Name = { title: [{ text: { content: input.name } }] };
  if (input.category !== undefined) properties.Category = { select: { name: input.category } };
  if (input.amount !== undefined) properties.Amount = { number: input.amount };
  if (input.currency !== undefined) properties.Currency = { select: { name: input.currency } };
  if (input.vendor !== undefined) properties.Vendor = { rich_text: [{ text: { content: input.vendor } }] };
  if (input.date !== undefined) properties.Date = { date: { start: input.date } };
  if (input.recurring !== undefined) properties.Recurring = { checkbox: input.recurring };
  if (input.companyId !== undefined) properties.Company = { relation: [{ id: input.companyId }] };
  if (input.notes !== undefined) properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

/** Adjusts an Account's Balance by `delta` (positive = credit, negative = debit). */
export async function adjustAccountBalance(accountId: string, delta: number) {
  const page = await notionFetch(`/pages/${accountId}`);
  const current = page?.properties?.Balance?.number || 0;
  return notionFetch(`/pages/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Balance: { number: Math.round((current + delta) * 100) / 100 },
        "Last Updated": { date: { start: new Date().toISOString().slice(0, 10) } },
      },
    }),
  });
}

export async function getIncome(limit = 200): Promise<Income[]> {
  const pages = await queryAll((await dbMap()).income, { sorts: [{ property: "Date", direction: "descending" }] });
  return pages.slice(0, limit).map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    source: (select(p.properties, "Source") as Income["source"]) || "Other",
    amount: num(p.properties, "Amount") || 0,
    currency: richText(p.properties, "Currency") || "LKR",
    date: dateStart(p.properties, "Date"),
    recurring: checkbox(p.properties, "Recurring"),
    companyId: relationIds(p.properties, "Company")[0],
    accountId: relationIds(p.properties, "Account")[0],
    notes: richText(p.properties, "Notes"),
    linkedPaymentId: relationIds(p.properties, "Linked Payment")[0],
  }));
}

export async function createIncome(input: {
  name: string;
  source: string;
  amount: number;
  currency?: string;
  date?: string;
  recurring?: boolean;
  companyId?: string;
  accountId?: string;
  notes?: string;
  linkedPaymentId?: string;
}) {
  const page = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).income },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        Source: { select: { name: input.source } },
        Amount: { number: input.amount },
        Currency: { rich_text: [{ text: { content: input.currency || "LKR" } }] },
        Date: { date: { start: input.date || new Date().toISOString().slice(0, 10) } },
        Recurring: { checkbox: Boolean(input.recurring) },
        ...(input.companyId ? { Company: { relation: [{ id: input.companyId }] } } : {}),
        ...(input.accountId ? { Account: { relation: [{ id: input.accountId }] } } : {}),
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
        ...(input.linkedPaymentId ? { "Linked Payment": { relation: [{ id: input.linkedPaymentId }] } } : {}),
      },
    }),
  });
  if (input.accountId) {
    await adjustAccountBalance(input.accountId, Math.abs(input.amount));
  }
  return page;
}

export async function getAccounts(): Promise<Account[]> {
  const pages = await queryAll((await dbMap()).accounts);
  return pages.map((p) => ({
    id: p.id,
    name: title(p.properties, "Name"),
    type: (select(p.properties, "Type") as Account["type"]) || "Other",
    balance: num(p.properties, "Balance") || 0,
    currency: richText(p.properties, "Currency"),
    institution: richText(p.properties, "Institution"),
    lastUpdated: dateStart(p.properties, "Last Updated"),
    notes: richText(p.properties, "Notes"),
  }));
}

export async function createAccount(input: {
  name: string;
  type?: string;
  balance: number;
  currency?: string;
  institution?: string;
  lastUpdated?: string;
  notes?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).accounts },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        Type: { select: { name: input.type || "Other" } },
        Balance: { number: input.balance },
        ...(input.currency ? { Currency: { rich_text: [{ text: { content: input.currency } }] } } : {}),
        ...(input.institution ? { Institution: { rich_text: [{ text: { content: input.institution } }] } } : {}),
        "Last Updated": { date: { start: input.lastUpdated || new Date().toISOString().slice(0, 10) } },
        ...(input.notes ? { Notes: { rich_text: [{ text: { content: input.notes } }] } } : {}),
      },
    }),
  });
}

export async function updateAccount(
  id: string,
  input: Partial<{
    name: string;
    type: string;
    balance: number;
    currency: string;
    institution: string;
    lastUpdated: string;
    notes: string;
  }>
) {
  const properties: Record<string, unknown> = {};
  if (input.name !== undefined) properties.Name = { title: [{ text: { content: input.name } }] };
  if (input.type !== undefined) properties.Type = { select: { name: input.type } };
  if (input.balance !== undefined) properties.Balance = { number: input.balance };
  if (input.currency !== undefined) properties.Currency = { rich_text: [{ text: { content: input.currency } }] };
  if (input.institution !== undefined)
    properties.Institution = { rich_text: [{ text: { content: input.institution } }] };
  if (input.lastUpdated !== undefined) properties["Last Updated"] = { date: { start: input.lastUpdated } };
  if (input.notes !== undefined) properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  return notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function createAstroEvent(input: {
  name: string;
  eventDate: string;
  keyTransits?: string;
  aiInterpretation?: string;
}) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: (await dbMap()).astroEvents },
      properties: {
        Name: { title: [{ text: { content: input.name } }] },
        "Event Date": { date: { start: input.eventDate } },
        ...(input.keyTransits ? { "Key Transits": { rich_text: [{ text: { content: input.keyTransits } }] } } : {}),
        ...(input.aiInterpretation
          ? { "AI Interpretation": { rich_text: [{ text: { content: input.aiInterpretation } }] } }
          : {}),
      },
    }),
  });
}

/* Request-level dedupe: the sidebar and the page body both need these on
   every render. `cache()` collapses that into a single Notion call per
   request without either caller having to know about the other. */
export const getCompanies = cache(_getCompanies);
export const getProjects = cache(_getProjects);
export const getTasks = cache(_getTasks);
