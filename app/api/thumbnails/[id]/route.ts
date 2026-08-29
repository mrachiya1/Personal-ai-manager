import { NextResponse } from "next/server";
import { getNotionToken } from "@/lib/userConfig";
import {
  MAX_FULL_BYTES,
  MAX_THUMB_BYTES,
  dataUrlToBlob,
  getFullImage,
  removeThumbnail,
  setThumbnail,
  validateDataUrl,
} from "@/lib/thumbnails";
import { setFileProperty, uploadBytes } from "@/lib/notionFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The lightbox's source: Notion's copy is the record, so it wins when present. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const full = await getFullImage(id);
  if (!full) return NextResponse.json({ error: "No stored image for that item." }, { status: 404 });
  return NextResponse.json({ full });
}

/**
 * Stores a pasted, dropped or picked image.
 *
 * The client sends two already-downscaled data URLs; resizing there rather than
 * here is deliberate — a phone camera paste is 6MB of JPEG, and uploading that
 * to resize it server-side spends the user's connection on bytes nobody keeps.
 *
 * The local write happens first and the Notion sync second, so a workspace that
 * refuses uploads still leaves the person with the preview they just pasted and
 * a clear line about what didn't sync.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const thumbCheck = validateDataUrl(body?.thumb, MAX_THUMB_BYTES, "thumbnail");
  if (!thumbCheck.ok) return NextResponse.json({ error: thumbCheck.error }, { status: 400 });

  let full: string | undefined;
  if (body?.full) {
    const fullCheck = validateDataUrl(body.full, MAX_FULL_BYTES, "full image");
    if (!fullCheck.ok) return NextResponse.json({ error: fullCheck.error }, { status: 400 });
    full = body.full;
  }

  const name = String(body?.name || "pasted-image").slice(0, 120);

  let synced = false;
  let syncNote: string | undefined;
  const token = await getNotionToken();
  if (token && full) {
    const source = dataUrlToBlob(full);
    if (source) {
      const ext = source.mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const upload = await uploadBytes(token, {
        name: name.includes(".") ? name : `${name}.${ext}`,
        type: source.mime,
        body: source.blob,
      });
      if (upload.ok) {
        // A thumbnail is one image, so this replaces rather than appends —
        // unlike Files, where a second attachment is a second resource.
        const attach = await setFileProperty(token, id, "Thumbnail", [
          { name, type: "file_upload", file_upload: { id: upload.uploadId! } },
        ]);
        synced = attach.ok;
        if (!attach.ok) syncNote = attach.error;
      } else {
        syncNote = upload.error;
      }
    }
  } else if (!token) {
    syncNote = "Notion isn't connected, so the image is stored in Orex OS only.";
  }

  const entry = await setThumbnail(id, { thumb: body.thumb, full, name, synced });
  return NextResponse.json({ ok: true, thumb: entry.thumb, synced, syncNote });
}

/** Clears the preview here and in Notion. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await removeThumbnail(id);
  const token = await getNotionToken();
  if (token) await setFileProperty(token, id, "Thumbnail", []);
  return NextResponse.json({ ok: true });
}
