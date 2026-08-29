// Preview images for projects and tasks.
//
// Two copies of every image, in two places, for two different reasons.
//
// THE SMALL ONE lives in this app's own per-user store as a data URL. The table
// renders up to a few hundred of these at once, and a Notion-hosted file URL is
// a signed link that expires after about an hour — so a page rendered from
// Notion URLs shows a grid of broken images to anyone who leaves the tab open
// over lunch. A 160px data URL is ~6KB, renders instantly, never expires, and
// costs one store read for the whole page.
//
// THE BIG ONE goes to Notion, into the page's Thumbnail property, so the image
// is part of the record rather than a decoration this app happens to hold. That
// upload is best-effort: an older workspace, a 5MB refusal or a dropped
// connection must not lose the preview the person just pasted.
//
// The lightbox prefers Notion's copy when it exists — that is the real file —
// and falls back to a 900px local copy so the enlarged view still works with
// Notion disconnected.

import { currentUserKey } from "@/auth";
import { getJSON, setJSON, store } from "@/lib/store";

export interface StoredThumb {
  /** 160px data URL, rendered in the table. */
  thumb: string;
  name: string;
  setAt: string;
  /** True once the full image also reached Notion's Thumbnail property. */
  synced?: boolean;
}

/** ~6KB expected; the cap is generous enough for a detailed 160px PNG. */
export const MAX_THUMB_BYTES = 80 * 1024;
/** The lightbox copy. Beyond this the store is being used as a file server. */
export const MAX_FULL_BYTES = 700 * 1024;

const indexKey = (userKey: string) => `thumbs:${userKey}`;
const fullKey = (userKey: string, pageId: string) => `thumbfull:${userKey}:${pageId}`;

/**
 * Every small preview this user has, keyed by page id.
 *
 * One read serves a whole table render. Held as a single blob rather than a key
 * per page precisely because the alternative is N store round-trips on a screen
 * that already makes several Notion calls.
 */
export async function getThumbnails(): Promise<Record<string, StoredThumb>> {
  const userKey = await currentUserKey();
  return getJSON<Record<string, StoredThumb>>(indexKey(userKey), {});
}

export async function getFullImage(pageId: string): Promise<string | null> {
  const userKey = await currentUserKey();
  return (await store().get(fullKey(userKey, pageId))) || null;
}

/**
 * Checks a data URL is an image and within budget.
 *
 * The store is per-user but the app is multi-tenant, so "it's only my own
 * data" is not a reason to skip this: an unbounded data URL is an unbounded
 * row in a shared Postgres, and a `data:text/html` URL rendered into an <img>
 * src is a place to hide script for whoever the workspace is shared with next.
 */
export function validateDataUrl(
  value: unknown,
  maxBytes: number,
  label: string
): { ok: true; bytes: number; mime: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value) return { ok: false, error: `No ${label} received.` };
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return { ok: false, error: `The ${label} must be a base64 PNG, JPEG, WebP, GIF or AVIF data URL.` };
  // 4 base64 characters carry 3 bytes; padding takes one byte off each.
  const b64 = match[2];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  if (bytes > maxBytes) {
    return { ok: false, error: `That ${label} is ${(bytes / 1024).toFixed(0)}KB — the limit is ${(maxBytes / 1024).toFixed(0)}KB.` };
  }
  return { ok: true, bytes, mime: match[1] };
}

export async function setThumbnail(
  pageId: string,
  input: { thumb: string; full?: string; name: string; synced?: boolean }
): Promise<StoredThumb> {
  const userKey = await currentUserKey();
  const index = await getJSON<Record<string, StoredThumb>>(indexKey(userKey), {});
  const entry: StoredThumb = {
    thumb: input.thumb,
    name: input.name.slice(0, 120),
    setAt: new Date().toISOString(),
    synced: input.synced,
  };
  index[pageId] = entry;
  await setJSON(indexKey(userKey), index);
  if (input.full) await store().set(fullKey(userKey, pageId), input.full);
  return entry;
}

export async function removeThumbnail(pageId: string): Promise<void> {
  const userKey = await currentUserKey();
  const index = await getJSON<Record<string, StoredThumb>>(indexKey(userKey), {});
  delete index[pageId];
  await setJSON(indexKey(userKey), index);
  await store().del(fullKey(userKey, pageId));
}

/** The base64 payload of a data URL as bytes, for handing to Notion. */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } | null {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = Buffer.from(match[2], "base64");
  return { blob: new Blob([new Uint8Array(binary)], { type: match[1] }), mime: match[1] };
}
