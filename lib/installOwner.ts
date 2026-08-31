// Who this install belongs to.
//
// This exists because of a bug that only appears the moment a second person
// signs in, and which is invisible until then.
//
// `NOTION_API_KEY` (and the seventeen `NOTION_*_DB` ids beside it) are the
// original single-user configuration: one workspace, read straight from the
// environment, no sign-in involved. When logins were added, every value kept
// falling back to those env vars for any user who had not connected their own
// Notion — which is every user on their first day.
//
// On a personal install that is exactly right. On a deployment with a team on
// it, it means an invited member who has not yet connected their own Notion
// opens /finance and reads the OWNER'S bank balances, through a code path
// nobody wrote on purpose and no permission check covers, because the data
// never passed through the sharing layer at all.
//
// So the install-wide credentials belong to exactly one account: the install
// owner. Everybody else uses their own, or has none — and "none" renders an
// empty tab with an explanation, which is the correct and safe answer.

import { getJSON, setJSON } from "./store";

const OWNER_KEY = "install:owner";

/** `u:` + email, matching lib/auth's `currentUserKey()`. */
function keyFor(email: string): string {
  return `u:${email.trim().toLowerCase()}`;
}

/**
 * The account that owns this install, or null when nobody has claimed it.
 *
 * Two ways it gets set, in order:
 *
 *   1. `OREX_OWNER_EMAIL` in the environment — explicit, and what a
 *      deployment should use, because it survives the store being wiped.
 *   2. The first account ever created here. A personal deploy is the owner
 *      signing up first, and asking them to set an env var to be recognised
 *      as themselves is a step with no purpose.
 */
export async function installOwnerKey(): Promise<string | null> {
  const declared = process.env["OREX_OWNER_EMAIL"];
  if (declared) return keyFor(declared);
  return getJSON<string | null>(OWNER_KEY, null);
}

/**
 * Claim the install for this account if nobody has.
 *
 * Called when an account is created. Racing two signups would be a problem
 * on a large system; here the window is milliseconds on a deploy that has
 * never been signed into, and the loser of the race is a second person
 * signing up in that same instant on a URL nobody has yet been given.
 */
export async function claimInstall(email: string): Promise<void> {
  if (process.env["OREX_OWNER_EMAIL"]) return;
  const existing = await getJSON<string | null>(OWNER_KEY, null);
  if (existing) return;
  await setJSON(OWNER_KEY, keyFor(email));
}

/** Whether this user key may use the install-wide Notion credentials. */
export async function isInstallOwner(userKey: string): Promise<boolean> {
  if (userKey === "local") return true; // no auth configured: single-user mode
  if (userKey === "anon") return false;
  const owner = await installOwnerKey();
  // An install nobody has claimed and no env names is a fresh deployment
  // whose first signup has not happened. Nobody gets the env credentials
  // until somebody claims it — the safe direction to be wrong in.
  return owner !== null && owner === userKey;
}
