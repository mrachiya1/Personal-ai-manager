import { NextResponse } from "next/server";
import { createProject } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const page = (await createProject(body)) as { id?: string };
    return NextResponse.json({ ok: true, id: page?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to create project" }, { status: 502 });
  }
}
