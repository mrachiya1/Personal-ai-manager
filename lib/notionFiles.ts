// Putting bytes into a Notion files property.
//
// Notion's upload is three calls and all three have to succeed or the file is
// orphaned in their storage with nothing pointing at it: ask for an upload
// slot, send the bytes to the URL that comes back, then reference the completed
// upload from the page property. It runs server-side so the integration token
// never reaches a browser.
//
// Extracted from the project-resources route because thumbnails need exactly
// the same three steps against a different property, and two copies of a
// three-call handshake is two places for the append-don't-replace rule to be
// forgotten.

const NOTION_VERSION = "2022-06-28";

function base() {
  // Bracket access, read at call time: the bundler inlines `process.env.FOO`
  // at build time, which is what made this untestable the first time round.
  return process.env["NOTION_API_BASE_URL"] || "https://api.notion.com/v1";
}

export function notionHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION };
}

/** Notion's free-plan ceiling. Refusing here beats a confusing error from them. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface NotionFileEntry {
  name: string;
  type?: string;
  external?: { url: string };
  file_upload?: { id: string };
}

/** The file list currently on a page property, so a write appends rather than replaces. */
export async function existingFiles(token: string, pageId: string, property = "Files"): Promise<any[]> {
  const res = await fetch(`${base()}/pages/${pageId}`, { headers: notionHeaders(token), cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.properties?.[property]?.files;
  return Array.isArray(list) ? list : [];
}

/** Re-shapes what Notion returned into what Notion accepts on the way back in. */
export function reusable(list: any[]): NotionFileEntry[] {
  return list
    .map((f: any) =>
      f?.type === "external"
        ? { name: f.name, type: "external", external: { url: f.external?.url } }
        : { name: f.name, type: "file_upload", file_upload: { id: f.file_upload?.id } }
    )
    .filter((f: any) => (f.type === "external" ? Boolean(f.external?.url) : Boolean(f.file_upload?.id)));
}

export interface UploadResult {
  ok: boolean;
  /** The completed upload's id, for referencing from a page property. */
  uploadId?: string;
  error?: string;
  status?: number;
}

/** Steps 1 and 2: create the slot and send the bytes. */
export async function uploadBytes(
  token: string,
  file: { name: string; type: string; body: Blob }
): Promise<UploadResult> {
  const create = await fetch(`${base()}/file_uploads`, {
    method: "POST",
    headers: { ...notionHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, content_type: file.type || "application/octet-stream" }),
  });
  const slot = await create.json().catch(() => ({}));
  if (!create.ok || !slot?.id) {
    return {
      ok: false,
      status: 502,
      error:
        slot?.message ||
        "Notion wouldn't start the upload. File uploads need a reasonably recent workspace — if this keeps failing, paste a link instead.",
    };
  }

  const form = new FormData();
  form.append("file", file.body, file.name);
  const send = await fetch(slot.upload_url || `${base()}/file_uploads/${slot.id}/send`, {
    method: "POST",
    headers: notionHeaders(token),
    body: form,
  });
  if (!send.ok) {
    const detail = await send.json().catch(() => ({}));
    return { ok: false, status: 502, error: detail?.message || `Upload failed (${send.status})` };
  }
  return { ok: true, uploadId: slot.id };
}

/** Step 3: write the property. `replace` is for single-slot properties like a thumbnail. */
export async function setFileProperty(
  token: string,
  pageId: string,
  property: string,
  files: NotionFileEntry[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${base()}/pages/${pageId}`, {
    method: "PATCH",
    headers: { ...notionHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { [property]: { files } } }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail?.message || `Notion returned ${res.status}` };
  }
  return { ok: true };
}
