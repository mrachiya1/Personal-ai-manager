"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Whole-app error boundary.
 *
 * Once each user brings their own Notion connection, a page can fail for
 * reasons that are entirely mundane and entirely the user's to fix: a token
 * revoked in Notion, a database un-shared from the integration, a workspace
 * that moved. A raw 500 tells them nothing. This names the likely cause and
 * points at the page where it gets fixed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[orex] render error:", error);
  }, [error]);

  const message = error?.message || "";
  const isNotion = /notion/i.test(message);
  const isAuth = /401|unauthorized|invalid.*token/i.test(message);
  const isMissing = /404|not found|could not find/i.test(message);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Something went wrong</div>
          <h1 className="brand-serif">This page couldn&apos;t load</h1>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">What happened</span>
          <div className="spacer" />
          <button className="filter-btn" onClick={reset} type="button">
            Try again
          </button>
        </div>

        <div style={{ padding: "14px 16px 18px 16px" }}>
          <p style={{ margin: "0 0 14px 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-secondary)" }}>
            {isAuth
              ? "Notion rejected the connection. The integration token is probably no longer valid — reconnect your workspace and this page will work again."
              : isMissing
                ? "Notion couldn't find one of the databases this page reads. That usually means the database exists but hasn't been shared with your integration, or its ID has changed."
                : isNotion
                  ? "Orex OS couldn't reach your Notion workspace. That's normally a connection or permissions problem rather than anything wrong with your data."
                  : "An unexpected error stopped this page from rendering. Your data is untouched."}
          </p>

          {isNotion && (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 16 }}>
              <Link href="/settings" className="btn-primary">
                Open Notion settings
              </Link>
              <Link href="/" className="btn-ghost">
                Back to Today
              </Link>
            </div>
          )}

          <details>
            <summary style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-muted)", cursor: "pointer" }}>
              Technical detail
            </summary>
            <pre
              style={{
                marginTop: 10, padding: "11px 12px", background: "var(--rail)",
                border: "1px solid var(--border)", borderRadius: 9, fontSize: 11.5,
                lineHeight: 1.6, color: "var(--ink-secondary)", overflowX: "auto", whiteSpace: "pre-wrap",
              }}
            >
              {message || "No error message available."}
              {error?.digest ? `\n\nDigest: ${error.digest}` : ""}
            </pre>
          </details>
        </div>
      </div>
    </>
  );
}
