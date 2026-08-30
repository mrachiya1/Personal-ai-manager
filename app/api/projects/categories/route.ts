import { NextResponse } from "next/server";
import { addCategoryOption, ensureProjectSchema } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  const schema = await ensureProjectSchema();
  return NextResponse.json({ options: schema.categoryOptions, problem: schema.problem });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const { options } = await addCategoryOption(String(body?.name ?? ""));
    return NextResponse.json({ ok: true, options });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that category";
    // A validation message is the user's fault to fix and belongs at 400; a
    // Notion failure is not, and a 400 would tell them to correct something
    // they typed correctly.
    const userError = /needs a name|too long|commas/.test(message);
    return NextResponse.json({ error: message }, { status: userError ? 400 : 502 });
  }
}
