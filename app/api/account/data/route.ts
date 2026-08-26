import { NextResponse } from "next/server";
import { currentUser, AUTH_ENABLED } from "@/auth";
import { deleteUserConfig, getUserConfig } from "@/lib/userConfig";
import { maskSecret, decryptSecret } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export everything this app holds about the current user.
 *
 * Secrets come back MASKED, not raw. An export is something people email to
 * themselves and paste into support threads; a file that leaks a Notion token
 * with full workspace write access would be a trap, not a feature. The actual
 * data — projects, expenses, everything — was always in the user's own Notion,
 * and Notion's own export covers that.
 */
export async function GET() {
  const cfg = await getUserConfig();
  const user = await currentUser();

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      account: AUTH_ENABLED
        ? { name: user?.name ?? null, email: user?.email ?? null }
        : { mode: "local", note: "This install runs without logins; configuration comes from .env.local." },
      notion: {
        connected: Boolean(cfg.notionTokenEnc),
        authType: cfg.notionAuthType ?? null,
        workspaceName: cfg.notionWorkspaceName ?? null,
        connectedAt: cfg.notionConnectedAt ?? null,
        token: maskSecret(decryptSecret(cfg.notionTokenEnc)),
        databaseOverrides: cfg.notionDb ?? {},
      },
      ai: {
        openRouterKey: maskSecret(decryptSecret(cfg.openRouterApiKeyEnc)),
        model: cfg.openRouterModel ?? null,
        visionModel: cfg.openRouterVisionModel ?? null,
      },
      preferences: {
        homeLat: cfg.homeLat ?? null,
        homeLon: cfg.homeLon ?? null,
        homeTzOffset: cfg.homeTzOffset ?? null,
        birthDate: cfg.birthDate ?? null,
      },
      createdAt: cfg.createdAt ?? null,
      updatedAt: cfg.updatedAt ?? null,
      note:
        "Your projects, clients, finances and slips live in your own Notion workspace, not here. " +
        "This file covers only the connection settings Orex OS stores for you.",
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="orex-os-account-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    }
  );
}

/**
 * Erase everything stored for this user: the Notion token, database mapping,
 * API keys and preferences. Nothing in their Notion workspace is touched —
 * this app never had the right to delete their actual records, and shouldn't.
 */
export async function DELETE() {
  await deleteUserConfig();
  return NextResponse.json({
    ok: true,
    message: "All stored settings deleted. Your Notion workspace itself is untouched.",
  });
}
