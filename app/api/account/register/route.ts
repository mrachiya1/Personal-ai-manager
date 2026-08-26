import { NextResponse } from "next/server";
import { createAccount, isValidEmail, passwordProblem } from "@/lib/accounts";
import { emailAllowed, SIGNUP_ENABLED } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates an email + password account.
 *
 * Signing the person in is deliberately NOT done here — the client calls
 * next-auth's own `signIn("credentials", …)` immediately afterwards, so there
 * is exactly one code path that issues a session, and this route can never
 * become a second way to mint one.
 */
export async function POST(req: Request) {
  if (!SIGNUP_ENABLED) {
    return NextResponse.json(
      { error: "Sign-ups aren't open on this instance. Ask the owner for an invite." },
      { status: 403 }
    );
  }

  let email = "";
  let password = "";
  let name: string | undefined;

  try {
    const body = await req.json();
    email = String(body?.email || "");
    password = String(body?.password || "");
    name = body?.name ? String(body.name) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  if (!emailAllowed(email)) {
    return NextResponse.json(
      { error: "That address isn't on this instance's allow-list. Ask the owner to add it." },
      { status: 403 }
    );
  }

  const result = await createAccount(email, password, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, email: result.account.email });
}
