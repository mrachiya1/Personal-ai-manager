// Route protection.
//
// When social login is configured, everything except the login page, the auth
// callbacks and static assets requires a session. When it is NOT configured
// (`AUTH_ENABLED` false — no OAuth keys in the environment) this middleware
// stays out of the way entirely, so a fresh clone still runs with `npm run dev`
// and no sign-in wall.

import { NextResponse, type NextRequest } from "next/server";

// `/api/account/register` has to be reachable while signed OUT — it is how you
// create the account in the first place. It does its own allow-list and
// signup-enabled checks, and never issues a session; only next-auth does that.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/account/register",
  "/_next",
  "/favicon",
  "/icon",
  "/apple-icon",
  "/public",
];

function authConfigured() {
  // AUTH_SECRET alone is enough: it turns on email + password accounts, which
  // is what makes a public deployment safe without the operator having to
  // register OAuth apps first. OAuth keys are checked too, so an install that
  // sets only those still gets the sign-in wall.
  const passwordLogin =
    Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) &&
    process.env.AUTH_DISABLE_PASSWORD !== "true";

  return Boolean(
    passwordLogin ||
      (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) ||
      (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
      (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) ||
      (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  );
}

/**
 * Presence check only — the cookie's signature is verified by Auth.js on the
 * server for every request that actually reads the session. Doing a full JWT
 * decode here would pull the whole auth config into the edge bundle for no
 * security gain, since middleware is a redirect convenience, not the boundary.
 */
function hasSessionCookie(req: NextRequest) {
  const names = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];
  return names.some((n) => req.cookies.has(n));
}

export function middleware(req: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (hasSessionCookie(req)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
