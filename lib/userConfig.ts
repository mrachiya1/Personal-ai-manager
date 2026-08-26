// Per-user configuration: which Notion workspace this person's app reads
// from, which databases inside it, and their own API keys.
//
// Resolution order for every value, most specific first:
//
//   1. What this signed-in user saved on their Settings page  (lib/store.ts)
//   2. What the local install saved in data/app-settings.json (lib/settings.ts)
//   3. The process environment                                (.env.local)
//
// Step 2 and 3 are what let the original single-user setup keep working
// untouched: if nobody has ever signed in and configured anything, the app
// behaves exactly as it did when NOTION_API_KEY was read straight from env.

import { cache } from "react";
import { currentUserKey } from "@/auth";
import { getJSON, setJSON, store } from "@/lib/store";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/** The Notion databases this app reads. Keys match lib/notion.ts's DB map. */
export const DB_KEYS = [
  "companies",
  "coreRules",
  "projects",
  "tasks",
  "clients",
  "payments",
  "ideas",
  "learning",
  "financeGoals",
  "wishlist",
  "astroEvents",
  "dailyLogs",
  "sleepLogs",
  "team",
  "expenses",
  "accounts",
  "income",
] as const;

export type DbKey = (typeof DB_KEYS)[number];

/** Human labels + the Notion database each key is expected to point at. */
export const DB_LABELS: Record<DbKey, string> = {
  companies: "Companies",
  coreRules: "Core Rules",
  projects: "Projects",
  tasks: "Tasks",
  clients: "Clients",
  payments: "Payments",
  ideas: "Ideas Inbox",
  learning: "Learning",
  financeGoals: "Finance Goals",
  wishlist: "Wishlist",
  astroEvents: "Astro Events",
  dailyLogs: "Daily Logs",
  sleepLogs: "Sleep Logs",
  team: "Team",
  expenses: "Expenses",
  accounts: "Accounts",
  income: "Income",
};

export interface UserConfig {
  /** Encrypted at rest. Never returned raw by the settings API. */
  notionTokenEnc?: string;
  /** "token" = pasted internal integration secret. "oauth" = connected via the Notion button. */
  notionAuthType?: "token" | "oauth";
  notionWorkspaceName?: string;
  notionWorkspaceIcon?: string;
  notionBotId?: string;
  notionConnectedAt?: string;
  /** Per-user Notion database IDs, overriding the shared defaults. */
  notionDb?: Partial<Record<DbKey, string>>;

  openRouterApiKeyEnc?: string;
  openRouterModel?: string;
  openRouterVisionModel?: string;

  homeLat?: string;
  homeLon?: string;
  homeTzOffset?: string;
  birthDate?: string;

  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

const EMPTY: UserConfig = {};

function keyFor(userKey: string) {
  return `cfg:${userKey}`;
}

/**
 * This request's config. `cache()` keeps it to a single store read per
 * request even though a page may consult it a dozen times while rendering.
 */
export const getUserConfig = cache(async (): Promise<UserConfig> => {
  const userKey = await currentUserKey();
  return getJSON<UserConfig>(keyFor(userKey), EMPTY);
});

export async function saveUserConfig(partial: Partial<UserConfig>): Promise<UserConfig> {
  const userKey = await currentUserKey();
  const current = await getJSON<UserConfig>(keyFor(userKey), EMPTY);
  const next: UserConfig = { ...current, ...partial, updatedAt: new Date().toISOString() };
  if (!next.createdAt) next.createdAt = next.updatedAt;

  // An explicitly-empty string means "clear this back to the default".
  for (const [k, v] of Object.entries(partial)) {
    if (v === "") delete (next as any)[k];
  }

  await setJSON(keyFor(userKey), next);
  return next;
}

/** Wipes everything this app stores about the current user. */
export async function deleteUserConfig(): Promise<void> {
  const userKey = await currentUserKey();
  await store().del(keyFor(userKey));
}

/* ------------------------------------------------------------------ */
/* Secrets                                                             */
/* ------------------------------------------------------------------ */

export async function setNotionToken(
  token: string,
  meta: { authType?: "token" | "oauth"; workspaceName?: string; workspaceIcon?: string; botId?: string } = {}
): Promise<void> {
  await saveUserConfig({
    notionTokenEnc: encryptSecret(token),
    notionAuthType: meta.authType || "token",
    notionWorkspaceName: meta.workspaceName,
    notionWorkspaceIcon: meta.workspaceIcon,
    notionBotId: meta.botId,
    notionConnectedAt: new Date().toISOString(),
  });
}

export async function clearNotionToken(): Promise<void> {
  const cfg = await getUserConfig();
  const next = { ...cfg };
  delete next.notionTokenEnc;
  delete next.notionAuthType;
  delete next.notionWorkspaceName;
  delete next.notionWorkspaceIcon;
  delete next.notionBotId;
  delete next.notionConnectedAt;
  const userKey = await currentUserKey();
  await setJSON(keyFor(userKey), { ...next, updatedAt: new Date().toISOString() });
}

export async function getNotionToken(): Promise<string | undefined> {
  const cfg = await getUserConfig();
  const own = decryptSecret(cfg.notionTokenEnc);
  if (own) return own;
  // Fall back to the install-wide key, which is how the app worked before
  // it had logins — and is still how a personal single-user deploy runs.
  return process.env.NOTION_API_KEY || undefined;
}

export async function getOpenRouterKey(): Promise<string | undefined> {
  const cfg = await getUserConfig();
  return decryptSecret(cfg.openRouterApiKeyEnc) || undefined;
}

export async function setOpenRouterKey(key: string): Promise<void> {
  await saveUserConfig({ openRouterApiKeyEnc: key ? encryptSecret(key) : undefined });
}

/* ------------------------------------------------------------------ */
/* Database IDs                                                        */
/* ------------------------------------------------------------------ */

/**
 * Install-wide default database IDs, read from the environment.
 *
 * These are deliberately EMPTY unless the environment supplies them. An
 * earlier version baked one particular workspace's database IDs in as
 * fallbacks, which was fine for a single personal install but wrong the
 * moment the app is deployed somewhere other people can reach: it published
 * those IDs to every visitor, and handed each new user a database map
 * pointing at a workspace they have no access to.
 *
 * A single-user install keeps working by putting its IDs in .env.local.
 * Everyone else maps their own databases on the Settings page.
 */
export const DEFAULT_DB: Record<DbKey, string> = {
  companies: process.env.NOTION_COMPANIES_DB || "",
  coreRules: process.env.NOTION_CORE_RULES_DB || "",
  projects: process.env.NOTION_PROJECTS_DB || "",
  tasks: process.env.NOTION_TASKS_DB || "",
  clients: process.env.NOTION_CLIENTS_DB || "",
  payments: process.env.NOTION_PAYMENTS_DB || "",
  ideas: process.env.NOTION_IDEAS_DB || "",
  learning: process.env.NOTION_LEARNING_DB || "",
  financeGoals: process.env.NOTION_FINANCE_GOALS_DB || "",
  wishlist: process.env.NOTION_WISHLIST_DB || "",
  astroEvents: process.env.NOTION_ASTRO_EVENTS_DB || "",
  dailyLogs: process.env.NOTION_DAILY_LOGS_DB || "",
  sleepLogs: process.env.NOTION_SLEEP_LOGS_DB || "",
  team: process.env.NOTION_TEAM_DB || "",
  expenses: process.env.NOTION_EXPENSES_DB || "",
  accounts: process.env.NOTION_ACCOUNTS_DB || "",
  income: process.env.NOTION_INCOME_DB || "",
};

/** Notion accepts both the dashed UUID and the bare 32-char form. Normalise. */
export function normaliseDbId(raw: string): string {
  const trimmed = raw.trim();
  // Accept a full Notion URL and pull the id out of it — that is what people
  // actually have on their clipboard.
  const fromUrl = trimmed.match(/([0-9a-fA-F]{32})/);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return trimmed.replace(/-/g, "").toLowerCase();
}

/** The effective database map for this request's user. */
export async function getDbMap(): Promise<Record<DbKey, string>> {
  const cfg = await getUserConfig();
  const overrides = cfg.notionDb || {};
  const out = { ...DEFAULT_DB };
  for (const k of DB_KEYS) {
    const v = overrides[k];
    if (v) out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Effective settings (user -> local file -> env)                      */
/* ------------------------------------------------------------------ */

export async function effectiveModel(kind: "text" | "vision"): Promise<string> {
  const cfg = await getUserConfig();
  if (kind === "vision") {
    return (
      cfg.openRouterVisionModel ||
      process.env.OPENROUTER_VISION_MODEL ||
      "google/gemini-2.5-flash"
    );
  }
  return cfg.openRouterModel || process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
}
