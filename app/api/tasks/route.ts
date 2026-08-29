import { NextResponse } from "next/server";
import { createTask } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "A task needs a title" }, { status: 400 });
  }
  try {
    const page: any = await createTask({
      title: body.title.trim(),
      projectId: body.projectId || undefined,
      status: body.status || "Backlog",
      dueDate: body.dueDate || undefined,
      startDate: body.startDate || undefined,
      priority: body.priority || undefined,
      // Any depth. The route doesn't know or care whether this is a milestone,
      // a sub-task or a sub-item — that's whatever the parent chain says.
      parentTaskId: body.parentTaskId || undefined,
      assignedTo: Array.isArray(body.assignedTo) ? body.assignedTo : undefined,
    });
    return NextResponse.json({ ok: true, id: page?.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task" },
      { status: 502 }
    );
  }
}
