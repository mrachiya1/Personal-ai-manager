export default function ConnectPrompt({
  title = "Connect Notion to see real data here",
  detail = "Add NOTION_API_KEY to .env.local, then share your \"Personal ai assistant\" Notion page with that integration (••• menu → Connections). See README.md for the full steps.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="card section-card" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
        {detail}
      </div>
    </div>
  );
}
