import { NextResponse } from "next/server";
import { archiveProject, updateProject } from "@/lib/notion";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    await updateProject(id, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update project" }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { tasksArchived } = await archiveProject(id);
    return NextResponse.json({ ok: true, tasksArchived });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't delete that project" },
      { status: 502 }
    );
  }
}
