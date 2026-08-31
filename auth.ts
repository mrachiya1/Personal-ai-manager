// Auth.js (NextAuth v5) configuration.
//
// Three deliberate choices:
//
// 1. **JWT sessions, no database adapter.** The only thing this app needs to
//    remember about a user long-term is their Notion connection, which lives
//    in lib/store.ts keyed by user id. Keeping sessions in a signed cookie
//    means logging in works identically on a laptop and on Vercel with no
//    session table to provision.
//
// 2. **Email + password works with zero setup.** Social login needs the
//    operator to register OAuth apps first; a public deployment can't wait for
//    that, and running with no login at all would mean every visitor shared
//    one settings bucket. So password accounts are enabled as soon as
//    AUTH_SECRET exists, and Google/GitHub layer on top whenever their keys
//    are added.
//
// 3. **Auth degrades to "local mode".** With no AUTH_SECRET and no OAuth keys,
//    `AUTH_ENABLED` is false and the app runs exactly as it did before logins
//    existed: one implicit local user, configuration read from .env.local.
//    That keeps `npm run dev` working on a fresh clone. It is ONLY safe
//    because it implies a machine only you can reach — never deploy to a
//    public URL without AUTH_SECRET set.
//
// Role is resolved once per sign-in (via lib/profile.ts → Supabase) and
// embedded in the JWT so every server component has it without a DB round-trip.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { authenticate, clearAttempts, normaliseEmail, recordAttempt, tooManyAttempts } from "@/lib/accounts";
import { claimInstall } from "@/lib/installOwner";
import { ensureProfile } from "@/lib/profile";

const googleId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const githubId = process.env.AUTH_GITHUB_ID || process.env.GITHUB_CLIENT_ID;
const githubSecret = process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_CLIENT_SECRET;

const hasSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);

/** Password sign-in is available whenever there's a secret to sign tokens with. */
export const PASSWORD_LOGIN_ENABLED = hasSecret && process.env.AUTH_DISABLE_PASSWORD !== "true";

/** Whether new people may create their own account, vs. invite-only. */
export const SIGNUP_ENABLED = PASSWORD_LOGIN_ENABLED && process.env.AUTH_DISABLE_SIGNUP !== "true";

const providers = [];

if (PASSWORD_LOGIN_ENABLED) {
  providers.push(
    Credentials({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = normaliseEmail(String(raw?.email || ""));
        const password = String(raw?.password || "");
        if (!email || !password) return null;

        // Throttle per address. Returning null (rather than throwing a
        // distinct error) keeps "wrong password" and "rate limited"
        // indistinguishable to an attacker enumerating accounts.
        if (tooManyAttempts(email)) return null;

        const account = await authenticate(email, password);
        if (!account) {
          recordAttempt(email);
          return null;
        }

        clearAttempts(email);
        return { id: account.email, email: account.email, name: account.name || account.email.split("@")[0] };
      },
    })
  );
}

if (googleId && googleSecret) {
  providers.push(Google({ clientId: googleId, clientSecret: googleSecret, allowDangerousEmailAccountLinking: true }));
}
if (githubId && githubSecret) {
  providers.push(GitHub({ clientId: githubId, clientSecret: githubSecret, allowDangerousEmailAccountLinking: true }));
}
const appleId = process.env["AUTH_APPLE_ID"];
const appleSecret = process.env["AUTH_APPLE_SECRET"];
if (appleId && appleSecret) {
  providers.push(Apple({ clientId: appleId, clientSecret: appleSecret, allowDangerousEmailAccountLinking: true }));
}

/** True when any sign-in method is configured. */
export const AUTH_ENABLED = providers.length > 0;

/** Which social buttons the login page should render. */
export const AVAILABLE_PROVIDERS: { id: string; name: string }[] = [
  ...(googleId && googleSecret ? [{ id: "google", name: "Google" }] : []),
  ...(githubId && githubSecret ? [{ id: "github", name: "GitHub" }] : []),
  ...(appleId && appleSecret ? [{ id: "apple", name: "Apple" }] : []),
];

/**
 * Optional allow-list. Set AUTH_ALLOWED_EMAILS to a comma-separated list to
 * restrict the app to specific people; leave it unset and anyone can sign up
 * and connect their own Notion.
 */
const allowList = (process.env.AUTH_ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function emailAllowed(email: string | null | undefined): boolean {
  if (allowList.length === 0) return true;
  return allowList.includes((email || "").toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      if (!emailAllowed(user?.email)) return false;

      // Claim install for this account if nobody has yet.
      if (user?.email) {
        try {
          await claimInstall(user.email);
        } catch {
          // Non-fatal — next sign-in will retry.
        }
      }

      return true;
    },

    async jwt({ token, profile, account, user }) {
      // Stabilise the user id across providers: prefer the email, because a
      // person signing in with a password today and Google tomorrow (same
      // address) should land on the same Notion connection, not a blank app.
      if (account && profile) {
        token.uid = (profile as any).email || token.sub;
      } else if (user?.email) {
        token.uid = user.email;
      }
      if (!token.uid) token.uid = token.email || token.sub;

      // Embed role in token so server components never need a Supabase round-trip.
      // Only (re-)read it on sign-in (account !== null) to avoid a DB hit on
      // every JWT refresh. The role can be forced up-to-date by signing out and in.
      if (account && token.uid) {
        try {
          const email = String(token.uid).replace(/^u:/, "");
          const oauthName =
            (profile as any)?.name ||
            (profile as any)?.login ||        // GitHub uses `login`
            user?.name ||
            undefined;
          const oauthAvatar =
            (profile as any)?.picture ||
            (profile as any)?.avatar_url ||   // GitHub
            user?.image ||
            undefined;
          const p = await ensureProfile(email, { displayName: oauthName, avatarUrl: oauthAvatar });
          token.role = p.role;                // "admin" | "member"
          token.displayName = p.displayName;
          token.avatarUrl = p.avatarUrl;
        } catch {
          // Supabase unavailable — default to member so we fail closed.
          token.role = "member";
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token.uid as string) || token.sub || "";
        (session.user as any).role = (token.role as string) || "member";
        (session.user as any).displayName = token.displayName as string | undefined;
        (session.user as any).avatarUrl = token.avatarUrl as string | undefined;
      }
      return session;
    },
  },
});

/**
 * The stable key this request's configuration is stored under.
 *
 * In local mode (nothing configured) every request resolves to the same
 * `local` user, which is what makes the single-user .env.local setup keep
 * working untouched.
 */
export async function currentUserKey(): Promise<string> {
  if (!AUTH_ENABLED) return "local";
  try {
    const session = await auth();
    const id = (session?.user as any)?.id || session?.user?.email;
    return id ? `u:${String(id).toLowerCase()}` : "anon";
  } catch {
    return "anon";
  }
}

/** The signed-in user, or null. Null in local mode too — there is no account. */
export async function currentUser() {
  if (!AUTH_ENABLED) return null;
  try {
    const session = await auth();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

/** The role for this request. Defaults to 'admin' in local (single-user) mode. */
export async function currentRole(): Promise<"admin" | "member"> {
  if (!AUTH_ENABLED) return "admin";
  try {
    const session = await auth();
    return ((session?.user as any)?.role as "admin" | "member") || "member";
  } catch {
    return "member";
  }
}
