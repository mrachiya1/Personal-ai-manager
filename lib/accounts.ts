// Email + password accounts.
//
// Why this exists alongside social login: deploying the app to a public URL
// requires *isolated* accounts, otherwise every visitor shares one settings
// bucket and would see whoever connected Notion last. Google/GitHub give that
// isolation but require the operator to register OAuth apps first. This path
// requires nothing at all, so a fresh deploy is self-serve from minute one.
//
// Storage is the same KV store as everything else (SQLite locally, Postgres in
// production), under `acct:<email>`. Nothing is kept beyond an email, an
// optional display name, and a password verifier.
//
// Hashing: scrypt from Node's crypto — memory-hard, in the standard library,
// no dependency to audit. Parameters are stored alongside each hash so they
// can be raised later without invalidating existing passwords.

import crypto from "crypto";
import { getJSON, setJSON, store } from "@/lib/store";

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

function accountKey(email: string) {
  return `acct:${normaliseEmail(email)}`;
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  // Deliberately permissive: the only thing that truly validates an address is
  // delivering to it, and over-strict regexes reject real addresses.
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
    // scrypt's default maxmem is too small for N=16384; raise it explicitly
    // rather than quietly weakening the parameters.
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
    // Constant-time: a length check first, because timingSafeEqual throws on
    // mismatched lengths and that throw would itself be a timing signal.
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function getAccount(email: string): Promise<StoredAccount | null> {
  if (!isValidEmail(email)) return null;
  return getJSON<StoredAccount | null>(accountKey(email), null);
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

  const account: StoredAccount = {
    email: clean,
    name: name?.trim() || undefined,
    verifier: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await setJSON(accountKey(clean), account);
  return { ok: true, account };
}

/** Returns the account on success, null on any failure. Never says which. */
export async function authenticate(email: string, password: string): Promise<StoredAccount | null> {
  const account = await getAccount(email);

  if (!account) {
    // Spend comparable time on a miss so response timing doesn't reveal
    // whether an address is registered.
    hashPassword(password);
    return null;
  }

  if (!verifyPassword(password, account.verifier)) return null;

  await setJSON(accountKey(account.email), { ...account, lastLoginAt: new Date().toISOString() });
  return account;
}

export async function deleteAccount(email: string): Promise<void> {
  await store().del(accountKey(email));
}

/* ------------------------------------------------------------------ */
/* Throttling                                                          */
/* ------------------------------------------------------------------ */

// Best-effort, in-process. On a serverless host each instance keeps its own
// counters, so this slows credential stuffing rather than stopping it — the
// real protections are scrypt's cost and the password rules above. It is here
// because unbounded free guessing against a known address is worse.
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

  // Keep the map from growing without bound on a long-lived instance.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (now - v.first > WINDOW_MS) attempts.delete(k);
    }
  }
}

export function clearAttempts(identifier: string): void {
  attempts.delete(identifier);
}
