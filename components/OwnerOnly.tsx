/**
 * OwnerOnly — wraps any page section that should only render for the admin.
 *
 * Members get a simple placeholder telling them this section is the owner's
 * personal workspace. No redirect, no error — just an honest message.
 *
 * Usage:
 *   import OwnerOnly from "@/components/OwnerOnly";
 *   ...
 *   return <OwnerOnly role={role}>{...page content...}</OwnerOnly>
 */

import { ReactNode } from "react";

export default function OwnerOnly({
  role,
  children,
}: {
  role: "admin" | "member";
  children: ReactNode;
}) {
  if (role !== "admin") {
    return (
      <div className="card section-card" style={{ marginTop: 24, textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <h2 style={{ marginBottom: 8 }}>Owner's personal workspace</h2>
        <p style={{ color: "var(--ink-muted)", maxWidth: 420, margin: "0 auto" }}>
          This section holds the workspace owner's private data — finances, daily logs, astrology,
          sleep tracking, and personal notes. It's not shared with team members.
          Connect your own Notion workspace in Settings to track your own.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
