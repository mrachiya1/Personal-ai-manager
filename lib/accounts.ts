// Email + password accounts — backed by Supabase.
//
// Why Supabase instead of the KV store: account data (password hashes,
// display names) belongs in a real database with backups, point-in-time
// recovery, and no dependency on a local SQLite file surviving a deploy.
//
// What stays in lib/store.ts: everything else — per-user Notion config
// (encrypted tokens, database ID maps), sharing/invite state, install
// owner. Those are tightly coupled to the KV API and have no benefit from
// moving; separating auth storage from app config also keeps concerns clean.
//
// The password format is unchanged: scrypt$N$r$p$saltB64$hashB64.
// Existing accounts hashed by the old KV path use the same verifier string,
// so a one-time migration (copy KV → Supabase) is all that would be needed
// to carry over any existing users.

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export interface StoredAccount {
  email: string;
  name?: string;
  /** scrypt$N$r$p$saltB64$hashB64 */
  verifier: string;
  createdAt: string;
  lastLoginAt?: string;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const MIN_PASSWORD_LENGTH = 10;

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Why a password is unacceptable, or null if it's fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/^\d+$/.test(password)) return "Use more than just digits.";
  const common = ["password", "12345678", "qwertyuiop", "letmein", "iloveyou", "admin123"];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    return "That's too close to a commonly guessed password.";
  }
  return null;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

function verifyPassword(password: string, verifier: string): boolean {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = verifier.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Supabase row shape (matches the migration in lib/supabase.ts)       */
/* ------------------------------------------------------------------ */

interface AccountRow {
  email: string;
  name: string | null;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
}

function rowToAccount(row: AccountRow): StoredAccount {
  return {
    email: row.email,
    name: row.name ?? undefined,
    verifier: row.password_hash,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function getAccount(email: string): Promise<StoredAccount | null> {
  if (!isValidEmail(email)) return null;
  const { data, error } = await supabaseAdmin()
    .from("orex_accounts")
    .select("*")
    .eq("email", normaliseEmail(email))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToAccount(data as AccountRow);
}

export async function accountExists(email: string): Promise<boolean> {
  return (await getAccount(email)) !== null;
}

export async function createAccount(
  email: string,
  password: string,
  name?: string
): Promise<{ ok: true; account: StoredAccount } | { ok: false; error: string }> {
  const clean = normaliseEmail(email);

  if (!isValidEmail(clean)) return { ok: false, error: "That doesn't look like an email address." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (await accountExists(clean)) {
    return { ok: false, error: "An account with that email already exists — sign in instead." };
  }

  const now = new Date().toISOString();
  const row: Omit<AccountRow, "last_login_at"> = {
    email: clean,
    name: name?.trim() || null,
    password_hash: hashPassword(password),
    created_at: now,
  };

  const { data, error } = await supabaseAdmin()
    .from("orex_accounts")
    .insert(row)
    .select()
    .single();

  if (error) throw error;

  return { ok: true, account: rowToAccount(data as AccountRow) };
}

/** Returns the account on success, null on any failure. Never says which. */
export async function authenticate(email: string, password: string): Promise<StoredAccount | null> {
  const account = await getAccount(email);

  if (!account) {
    // Spend comparable time so response timing doesn't reveal whether the
    // address is registered.
    hashPassword(password);
    return null;
  }

  if (!verifyPassword(password, account.verifier)) return null;

  const loginAt = new Date().toISOString();
  await supabaseAdmin()
    .from("orex_accounts")
    .update({ last_login_at: loginAt })
    .eq("email", account.email);

  return { ...account, lastLoginAt: loginAt };
}

export async function deleteAccount(email: string): Promise<void> {
  await supabaseAdmin()
    .from("orex_accounts")
    .delete()
    .eq("email", normaliseEmail(email));
}

/* ------------------------------------------------------------------ */
/* Throttling (in-process; slows stuffing, not a hard stop)           */
/* ------------------------------------------------------------------ */

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(identifier: string): boolean {
  const now = Date.now();
  const rec = attempts.get(identifier);
  if (!rec) return false;
  if (now - rec.first > WINDOW_MS) {
    attempts.delete(identifier);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

export function recordAttempt(identifier: string): void {
  const now = Date.now();
  const rec = attempts.get(identifier);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(identifier, { count: 1, first: now });
    return;
  }
  rec.count += 1;
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (now - v.first > WINDOW_MS) attempts.delete(k);
    }
  }
}

export function clearAttempts(identifier: string): void {
  attempts.delete(identifier);
}
