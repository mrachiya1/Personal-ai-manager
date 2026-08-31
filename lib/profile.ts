// User profiles in Supabase.
//
// A profile is created the first time someone signs in (any provider).
// The role is set once, based on whether this account is the install owner
// (lib/installOwner.ts). After that it only changes if an admin explicitly
// changes it — which currently means a direct DB edit; a UI can be added later.
//
// This is the ONLY source of truth for role. The JWT embeds it at sign-in so
// every server component has it without an extra round-trip.

import { supabaseAdmin } from "@/lib/supabase";
import { isInstallOwner } from "@/lib/installOwner";

export type Role = "admin" | "member";

export interface Profile {
  userEmail: string;
  displayName?: string;
  role: Role;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileRow {
  user_email: string;
  display_name: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    userEmail: row.user_email,
    displayName: row.display_name ?? undefined,
    role: (row.role as Role) || "member",
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(email: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("user_email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToProfile(data as ProfileRow);
}

export async function upsertProfile(
  email: string,
  patch: Partial<Omit<Profile, "userEmail" | "createdAt" | "updatedAt">>
): Promise<Profile> {
  const clean = email.trim().toLowerCase();
  const now = new Date().toISOString();

  const row: Partial<ProfileRow> & { user_email: string; updated_at: string } = {
    user_email: clean,
    updated_at: now,
  };
  if (patch.displayName !== undefined) row.display_name = patch.displayName ?? null;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl ?? null;

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .upsert({ created_at: now, role: "member", ...row }, { onConflict: "user_email" })
    .select()
    .single();

  if (error) throw error;
  return rowToProfile(data as ProfileRow);
}

/**
 * Ensure a profile exists for this email, creating it with the correct role
 * if it doesn't. Called on every successful sign-in.
 *
 * The role is derived from lib/installOwner.ts — the first account to claim
 * the install becomes admin; everyone else is member. This happens once; after
 * that the stored role wins (an admin can later promote someone via direct DB).
 */
export async function ensureProfile(
  email: string,
  opts: { displayName?: string; avatarUrl?: string } = {}
): Promise<Profile> {
  const clean = email.trim().toLowerCase();

  const existing = await getProfile(clean);
  if (existing) {
    // Update display name and avatar from the OAuth profile when they change.
    const needsUpdate =
      (opts.displayName && opts.displayName !== existing.displayName) ||
      (opts.avatarUrl && opts.avatarUrl !== existing.avatarUrl);
    if (!needsUpdate) return existing;
    return upsertProfile(clean, {
      role: existing.role,
      displayName: opts.displayName || existing.displayName,
      avatarUrl: opts.avatarUrl || existing.avatarUrl,
    });
  }

  // First sign-in for this account — determine their role.
  const userKey = `u:${clean}`;
  const isOwner = await isInstallOwner(userKey);
  const role: Role = isOwner ? "admin" : "member";

  return upsertProfile(clean, {
    role,
    displayName: opts.displayName,
    avatarUrl: opts.avatarUrl,
  });
}
