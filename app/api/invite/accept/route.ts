// POST /api/invite/accept — redeem an invite token, create the account.
//
// Does NOT require an existing session — this is the endpoint an uninvited
// person calls to become a user for the first time.

import { NextRequest, NextResponse } from "next/server";
import { getInvite, consumeInvite } from "@/lib/invites";
import { createAccount, accountExists } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let token: string, name: string, password: string;
  try {
    const body = await req.json();
    token = String(body.token || "").trim();
    name = String(body.name || "").trim();
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!token || !password) {
    return NextResponse.json({ error: "token and password are required" }, { status: 400 });
  }

  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "This invite link is invalid, expired, or has already been used." }, { status: 404 });
  }

  if (await accountExists(invite.email)) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  await createAccount(invite.email, password, name || invite.email.split("@")[0]);
  await consumeInvite(token);

  return NextResponse.json({ email: invite.email });
}
