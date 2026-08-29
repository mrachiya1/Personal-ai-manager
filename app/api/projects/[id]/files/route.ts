import { NextResponse } from "next/server";
import { getNotionToken } from "@/lib/userConfig";
import { MAX_UPLOAD_BYTES, existingFiles, reusable, setFileProperty, uploadBytes } from "@/lib/notionFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attaches a file to a project.
 *
 * The three-step Notion upload lives in lib/notionFiles.ts; what this route
 * owns is the policy — what's too big, what the error should say, and that an
 * upload appends to the resource list rather than replacing it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)}MB. Notion caps uploads at 5MB on the free plan — link to it instead, or upgrade the workspace.`,
      },
      { status: 400 }
    );
  }

  try {
    const upload = await uploadBytes(token, { name: file.name, type: file.type, body: file });
    if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.status ?? 502 });

    const current = await existingFiles(token, id);
    const attach = await setFileProperty(token, id, "Files", [
      ...reusable(current),
      { name: file.name, type: "file_upload", file_upload: { id: upload.uploadId! } },
    ]);
    if (!attach.ok) {
      return NextResponse.json(
        { error: attach.error || "The file uploaded but couldn't be attached to the project." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, name: file.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 502 });
  }
}

/** Detaches a file by name. The bytes stay in Notion's storage; the link goes. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const { name } = await req.json().catch(() => ({ name: "" }));
  if (!name) return NextResponse.json({ error: "Which file?" }, { status: 400 });

  const current = await existingFiles(token, id);
  const res = await setFileProperty(token, id, "Files", reusable(current.filter((f: any) => f.name !== name)));
  if (!res.ok) return NextResponse.json({ error: res.error || "Couldn't remove that file." }, { status: 502 });
  return NextResponse.json({ ok: true });
}

/**
 * Attaches an external link — a Figma file, a Drive folder, a PR, a live URL.
 *
 * Notion's `files` property holds two kinds of entry: uploaded files and
 * external URLs. Putting links in the same property rather than inventing a
 * second one means a project's resources are one list in Notion too, and the
 * table's file count is the real count.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const label = String(body?.label || "").trim();
  const url = String(body?.url || "").trim();

  if (!url) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a URL — include the https://" }, { status: 400 });
  }
  // Only web links. A javascript: or data: URL in a shared workspace is a
  // handed-over script, not a resource.
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "Only http and https links can be attached." }, { status: 400 });
  }

  const name = (label || parsed.hostname.replace(/^www\./, "")).slice(0, 100);

  try {
    const existing = await existingFiles(token, id);
    if (existing.some((f: { external?: { url?: string } }) => f?.external?.url === url)) {
      return NextResponse.json({ error: "That link is already attached." }, { status: 409 });
    }
    const res = await setFileProperty(token, id, "Files", [
      ...reusable(existing),
      { name, type: "external", external: { url } },
    ]);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true, name, url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't attach that link" },
      { status: 502 }
    );
  }
}
