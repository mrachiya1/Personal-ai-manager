// POST /api/invite — admin creates an invite link for an email address.
// GET  /api/invite?token=… — validate a token (returns email if valid).

import { NextRequest, NextResponse } from "next/server";
import { currentRole, currentUserKey } from "@/auth";
import { createInvite, getInvite } from "@/lib/invites";
import { accountExists } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Only admins may issue invites.
  const role = await currentRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let email: string;
  try {
    const body = await req.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  // Don't issue an invite to someone who already has an account.
  if (await accountExists(email)) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const createdBy = await currentUserKey();
  const token = await createInvite(email, createdBy);

  const base = req.nextUrl.origin;
  return NextResponse.json({ url: `${base}/invite/${token}`, token });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  return NextResponse.json({ email: invite.email, expiresAt: invite.expiresAt });
}
