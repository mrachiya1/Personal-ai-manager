import Link from "next/link";

/**
 * Shown when a user has connected their Notion token but hasn't yet pointed
 * the app at any of their databases.
 *
 * Without this the app is quietly, inexplicably empty: every tab renders fine
 * and shows nothing, because `queryAll` treats an unmapped database as empty
 * rather than crashing. That degradation is the right behaviour, but it needs
 * to come with an explanation or it reads as "this app is broken".
 */
export default function SetupBanner({ unmappedCount, total }: { unmappedCount: number; total: number }) {
  if (unmappedCount === 0) return null;
  const allUnmapped = unmappedCount === total;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 14px",
        marginBottom: 16,
        borderRadius: 11,
        background: "var(--warning-bg)",
        border: "1px solid rgba(250,178,25,0.3)",
        flexWrap: "wrap",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9c5b12" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--warning-ink)", minWidth: 0, flex: 1 }}>
        {allUnmapped ? (
          <>
            <strong>Almost there.</strong> Your Notion is connected, but the app doesn&apos;t know which databases to
            read yet — so every tab will look empty.
          </>
        ) : (
          <>
            <strong>{unmappedCount} of {total} databases aren&apos;t mapped yet.</strong> The tabs that use them will
            look empty until you point them at a database.
          </>
        )}
      </div>
      <Link
        href="/settings"
        className="btn-ghost"
        style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8, flexShrink: 0 }}
      >
        Map databases
      </Link>
    </div>
  );
}
