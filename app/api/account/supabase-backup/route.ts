import { NextResponse } from "next/server";
import { currentRole } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full backup of this app's own Supabase tables — accounts and profiles.
 *
 * Admin-only: this is install-wide data (every team member's account row),
 * not one person's settings, so it uses the same admin gate as the rest of
 * the owner-only surface (components/OwnerOnly.tsx) rather than the per-user
 * export at /api/account/data.
 *
 * password_hash is never included. It's a scrypt verifier, not a password,
 * but a backup file is something that ends up in email attachments and chat
 * threads, and leaving it out costs nothing since restoring an account from
 * this file was never the point — it's a record of who has access, not a
 * disaster-recovery mechanism (Supabase's own backups cover that).
 */
export async function GET() {
  const role = await currentRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const db = supabaseAdmin();

  const [accountsRes, profilesRes] = await Promise.all([
    db.from("orex_accounts").select("email, name, created_at, last_login_at").order("created_at"),
    db.from("profiles").select("*").order("created_at"),
  ]);

  if (accountsRes.error) throw accountsRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const body = {
    backedUpAt: new Date().toISOString(),
    source: "orex-os / supabase",
    tables: {
      orex_accounts: accountsRes.data ?? [],
      profiles: profilesRes.data ?? [],
    },
    note: "password_hash is intentionally omitted. This is a record of accounts and roles, not a restore image — Supabase's own project backups cover disaster recovery.",
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Disposition": `attachment; filename="orex-os-supabase-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
