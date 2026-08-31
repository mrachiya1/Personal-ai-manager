// Invite token management.
//
// An invite is a short-lived signed token that lets a specific email address
// create an account without going through the public signup flow.
//
// Stored in the KV store (lib/store.ts) keyed by token. Tokens are 32 random
// hex bytes, expire after 7 days, and are consumed on first use so they can't
// be replayed.

import { getJSON, setJSON } from "./store";
import { store } from "./store";
import { randomBytes } from "crypto";

const PREFIX = "invite:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Invite {
  token: string;
  email: string;         // pre-assigned address; the account must use this one
  createdBy: string;     // user key of the admin who issued it
  createdAt: string;     // ISO
  expiresAt: string;     // ISO
  used: boolean;
}

function key(token: string): string {
  return `${PREFIX}${token}`;
}

/** Create a new invite for the given email. Returns the token. */
export async function createInvite(email: string, createdBy: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const now = new Date();
  const invite: Invite = {
    token,
    email: email.trim().toLowerCase(),
    createdBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    used: false,
  };
  await setJSON(key(token), invite);
  return token;
}

/** Look up an invite. Returns null if not found, expired, or already used. */
export async function getInvite(token: string): Promise<Invite | null> {
  const invite = await getJSON<Invite | null>(key(token), null);
  if (!invite) return null;
  if (invite.used) return null;
  if (new Date(invite.expiresAt) < new Date()) return null;
  return invite;
}

/** Mark an invite as used (call after account is successfully created). */
export async function consumeInvite(token: string): Promise<void> {
  const invite = await getJSON<Invite | null>(key(token), null);
  if (!invite) return;
  await setJSON(key(token), { ...invite, used: true });
}

/** Delete an invite outright (admin revoke). */
export async function revokeInvite(token: string): Promise<void> {
  await store().del(key(token));
}
