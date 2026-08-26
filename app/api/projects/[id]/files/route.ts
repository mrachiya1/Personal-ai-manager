import { NextResponse } from "next/server";
import { getNotionToken } from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTION_VERSION = "2022-06-28";
const BASE = process.env.NOTION_API_BASE_URL || "https://api.notion.com/v1";

// Notion's own limit on the free plan. Paid workspaces allow far more, but
// refusing here with a clear message beats a confusing failure from their API.
const MAX_BYTES = 5 * 1024 * 1024;

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION };
}

/** The file list currently on the page, so an upload appends rather than replaces. */
async function existingFiles(token: string, pageId: string) {
  const res = await fetch(`${BASE}/pages/${pageId}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.properties?.Files?.files;
  return Array.isArray(list) ? list : [];
}

/**
 * Attaches a file to a project.
 *
 * Notion uploads are three steps, and all three must succeed or the file is
 * orphaned: create an upload slot, send the bytes to the URL it returns, then
 * reference the completed upload from the page property. Doing it server-side
 * keeps the integration token off the client.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)}MB. Notion caps uploads at 5MB on the free plan — link to it instead, or upgrade the workspace.`,
      },
      { status: 400 }
    );
  }

  try {
    /* 1. Ask Notion for an upload slot. */
    const create = await fetch(`${BASE}/file_uploads`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, content_type: file.type || "application/octet-stream" }),
    });
    const slot = await create.json().catch(() => ({}));
    if (!create.ok || !slot?.id) {
      return NextResponse.json(
        {
          error:
            slot?.message ||
            "Notion wouldn't start the upload. File uploads need a reasonably recent workspace — if this keeps failing, paste a link instead.",
        },
        { status: 502 }
      );
    }

    /* 2. Send the bytes. */
    const upload = new FormData();
    upload.append("file", file, file.name);
    const send = await fetch(slot.upload_url || `${BASE}/file_uploads/${slot.id}/send`, {
      method: "POST",
      headers: headers(token),
      body: upload,
    });
    if (!send.ok) {
      const detail = await send.json().catch(() => ({}));
      return NextResponse.json({ error: detail?.message || `Upload failed (${send.status})` }, { status: 502 });
    }

    /* 3. Reference it from the page, keeping whatever is already there. */
    const current = await existingFiles(token, id);
    const attach = await fetch(`${BASE}/pages/${id}`, {
      method: "PATCH",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          Files: {
            files: [
              ...current.map((f: any) =>
                f.type === "external"
                  ? { name: f.name, type: "external", external: { url: f.external.url } }
                  : { name: f.name, type: "file_upload", file_upload: { id: f.file_upload?.id } }
              ).filter((f: any) => f.type === "external" || f.file_upload?.id),
              { name: file.name, type: "file_upload", file_upload: { id: slot.id } },
            ],
          },
        },
      }),
    });

    if (!attach.ok) {
      const detail = await attach.json().catch(() => ({}));
      return NextResponse.json(
        { error: detail?.message || "The file uploaded but couldn't be attached to the project." },
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
  const kept = current
    .filter((f: any) => f.name !== name)
    .map((f: any) =>
      f.type === "external"
        ? { name: f.name, type: "external", external: { url: f.external.url } }
        : { name: f.name, type: "file_upload", file_upload: { id: f.file_upload?.id } }
    )
    .filter((f: any) => f.type === "external" || f.file_upload?.id);

  const res = await fetch(`${BASE}/pages/${id}`, {
    method: "PATCH",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { Files: { files: kept } } }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail?.message || "Couldn't remove that file." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
