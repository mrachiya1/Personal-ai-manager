// Resolves which OpenRouter key and model this request should use.
//
// Order, most specific first:
//   1. The signed-in user's own key/model (Settings page -> lib/userConfig)
//   2. The local install's data/app-settings.json (lib/settings)
//   3. .env.local
//
// Every AI feature goes through here, so a user who pastes their own key on
// the Settings page immediately gets billed to their own account instead of
// silently spending the install owner's credits.

import { setting } from "@/lib/settings";
import { effectiveModel, getOpenRouterKey } from "@/lib/userConfig";

export interface OpenRouterConfig {
  apiKey?: string;
  model: string;
}

export async function resolveOpenRouter(kind: "text" | "vision" = "text"): Promise<OpenRouterConfig> {
  const userKey = await getOpenRouterKey();
  const apiKey = userKey || setting("openRouterApiKey", "OPENROUTER_API_KEY");

  // A per-user model choice wins; otherwise fall back to the install default.
  const userModel = await effectiveModel(kind);
  const localModel =
    kind === "vision"
      ? setting("openRouterVisionModel", "OPENROUTER_VISION_MODEL")
      : setting("openRouterModel", "OPENROUTER_MODEL");

  return { apiKey, model: userModel || localModel || (kind === "vision" ? "google/gemini-2.5-flash" : "deepseek/deepseek-chat") };
}

/** Shared request headers for OpenRouter, so attribution is consistent. */
export function openRouterHeaders(apiKey: string, title: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://orex-os.local",
    "X-Title": title,
  };
}

/**
 * Where chat completions are sent.
 *
 * Read through bracket access and inside a function on purpose: the bundler
 * inlines `process.env.FOO` at build time, so a dotted module-level constant
 * bakes the production URL into the build and the QA harness silently talks to
 * the real API — which is exactly the bug this codebase already hit once with
 * the Notion base URL. Read at call time, it can be pointed at a stand-in.
 */
export function openRouterUrl(path = "/chat/completions"): string {
  const base = process.env["OPENROUTER_API_BASE_URL"] || "https://openrouter.ai/api/v1";
  return `${base}${path}`;
}
