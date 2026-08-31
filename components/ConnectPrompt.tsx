import { AUTH_ENABLED, currentRole } from "@/auth";

async function resolveRole(): Promise<"admin" | "member"> {
  try {
    if (!AUTH_ENABLED) return "admin";
    return await currentRole();
  } catch {
    return "admin";
  }
}

export default async function ConnectPrompt({
  title,
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  const role = await resolveRole();
  const isMember = role === "member";

  const defaultTitle = isMember
    ? "Connect your own Notion workspace"
    : "Connect Notion to see real data here";

  const defaultDetail = isMember
    ? "This section uses your personal Notion workspace. Go to Settings → Notion and paste your own integration token to unlock it. Your data stays private — only you can see it."
    : "Add NOTION_API_KEY to .env.local, then share your \"Personal ai assistant\" Notion page with that integration (••• menu → Connections). See README.md for the full steps.";

  return (
    <div className="card section-card" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title ?? defaultTitle}</div>
      <div style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
        {detail ?? defaultDetail}
      </div>
      {isMember && (
        <a
          href="/settings"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "8px 20px",
            background: "var(--ink)",
            color: "#fbfaf6",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Go to Settings →
        </a>
      )}
    </div>
  );
}
