"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The square preview to the left of a project or task name.
 *
 * Three ways in, because people reach for different ones: Ctrl/Cmd-V with the
 * cell focused, a drag from the desktop, or a click that opens the file dialog
 * when the cell is empty. The paste path is the one that matters for this
 * workspace — a render is in the clipboard the moment it comes out of the
 * viewport, and making that a two-dialog upload is how a preview column ends
 * up permanently empty.
 *
 * Resizing happens here rather than on the server. A phone-camera paste is
 * several megabytes of JPEG; sending that up so the server can throw 99% of it
 * away spends the user's connection on bytes nobody keeps. Two sizes go up: a
 * 160px thumb for the table and a 900px copy for the lightbox and for Notion.
 */

const THUMB_PX = 160;
const FULL_PX = 900;

export type ThumbCategory = "3d" | "film" | "web" | "task" | "generic";

/** Maps a project's Notion category words onto the placeholder icons. */
export function categoryIcon(values: string[] | undefined): ThumbCategory {
  const joined = (values || []).join(" ").toLowerCase();
  if (/3d|cgi|render|model|animation|motion/.test(joined)) return "3d";
  if (/film|video|edit|reel|vfx|shoot/.test(joined)) return "film";
  if (/web|site|app|ui|ux|software|dev/.test(joined)) return "web";
  return "generic";
}

function Placeholder({ kind }: { kind: ThumbCategory }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "3d") {
    return (
      <svg {...common}>
        <path d="M12 2.8 20.4 7v10L12 21.2 3.6 17V7z" />
        <path d="M3.6 7 12 11.4 20.4 7M12 11.4v9.8" />
      </svg>
    );
  }
  if (kind === "film") {
    return (
      <svg {...common}>
        <rect x="2.8" y="5" width="18.4" height="14" rx="2.2" />
        <path d="M7.4 5v14M16.6 5v14M2.8 12h18.4M2.8 8.5h4.6M2.8 15.5h4.6M16.6 8.5h4.6M16.6 15.5h4.6" />
      </svg>
    );
  }
  if (kind === "web") {
    return (
      <svg {...common}>
        <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="2.2" />
        <path d="M2.8 9h18.4M5.8 6.7h.01M8.4 6.7h.01" />
      </svg>
    );
  }
  if (kind === "task") {
    return (
      <svg {...common}>
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" />
        <path d="m8.2 12.4 2.6 2.6 5-5.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2.4" />
      <circle cx="9" cy="9.8" r="1.6" />
      <path d="m4.4 17.4 4.8-4.6 3.4 3.2 3-2.6 4 4" />
    </svg>
  );
}

/** Draws the image onto a canvas at `max` on its longest side, cover-cropped square for the thumb. */
async function downscale(source: HTMLImageElement, max: number, square: boolean, quality: number): Promise<string> {
  const canvas = document.createElement("canvas");
  if (square) {
    canvas.width = max;
    canvas.height = max;
    const side = Math.min(source.naturalWidth, source.naturalHeight);
    const sx = (source.naturalWidth - side) / 2;
    const sy = (source.naturalHeight - side) / 2;
    canvas.getContext("2d")!.drawImage(source, sx, sy, side, side, 0, 0, max, max);
  } else {
    const scale = Math.min(1, max / Math.max(source.naturalWidth, source.naturalHeight));
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image this browser can read."));
    };
    img.src = url;
  });
}

export default function Thumbnail({
  pageId,
  name,
  src,
  category = "generic",
  size = 32,
  onChange,
}: {
  pageId: string;
  /** What the image is of — used for the alt text and the lightbox caption. */
  name: string;
  /** Current preview, if any: the stored data URL or a Notion file URL. */
  src?: string;
  category?: ThumbCategory;
  size?: 32 | 40;
  /** Called with the new thumb data URL, or null when cleared. */
  onChange?: (thumb: string | null) => void;
}) {
  const [preview, setPreview] = useState<string | undefined>(src);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setPreview(src), [src]);

  // Escape closes the lightbox. A full-screen overlay with no keyboard exit is
  // a trap for anyone not using a mouse.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  async function accept(file: Blob | null | undefined, fileName: string) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't an image.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const img = await loadImage(file);
      const thumb = await downscale(img, THUMB_PX, true, 0.82);
      const full = await downscale(img, FULL_PX, false, 0.85);
      // Optimistic: the image is on screen before the round trip, and rolls
      // back below if the server refuses it.
      const before = preview;
      setPreview(thumb);
      const res = await fetch(`/api/thumbnails/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumb, full, name: fileName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreview(before);
        throw new Error(data?.error || "Couldn't save that image.");
      }
      // Not an error — the preview is saved either way. But a person who
      // expects the image to be in Notion should be told when it isn't.
      if (data?.syncNote) setNote(data.syncNote);
      onChange?.(thumb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that image.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/thumbnails/${pageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove that image.");
      setPreview(undefined);
      onChange?.(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that image.");
    } finally {
      setBusy(false);
    }
  }

  async function openLightbox() {
    // The stored 900px copy, falling back to whatever is already on screen so
    // the enlarged view still works before anything has been re-uploaded.
    try {
      const res = await fetch(`/api/thumbnails/${pageId}`);
      if (res.ok) {
        const data = await res.json();
        setLightbox(data.full || preview || null);
        return;
      }
    } catch {
      /* fall through to the on-screen copy */
    }
    setLightbox(preview || null);
  }

  return (
    <>
      <span
        className={`thumb thumb-${size}${preview ? " has-image" : ""}${dragging ? " dragging" : ""}${busy ? " busy" : ""}`}
        tabIndex={0}
        role="button"
        aria-label={
          preview ? `${name} preview — click to enlarge, paste to replace` : `Add a preview image for ${name} — click, or paste with Ctrl+V`
        }
        title={preview ? "Click to enlarge · paste or drop to replace" : "Click to upload · or paste an image with Ctrl+V"}
        onClick={() => (preview ? openLightbox() : fileInput.current?.click())}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            preview ? openLightbox() : fileInput.current?.click();
          }
          if ((e.key === "Delete" || e.key === "Backspace") && preview) {
            e.preventDefault();
            clear();
          }
        }}
        onPaste={(e) => {
          const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
          if (!item) return;
          e.preventDefault();
          const file = item.getAsFile();
          accept(file, file?.name || "pasted-image.png");
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer?.files?.[0];
          accept(file, file?.name || "dropped-image.png");
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${name} preview`} />
        ) : (
          <span className="thumb-ph">
            <Placeholder kind={category} />
          </span>
        )}
        {busy && <span className="thumb-busy" aria-hidden />}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            accept(file, file?.name || "image.png");
            e.target.value = "";
          }}
        />
      </span>

      {(error || note) && (
        <span className={`thumb-msg${error ? " bad" : ""}`} role="status">
          {error || note}
        </span>
      )}

      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${name} preview`} onClick={() => setLightbox(null)}>
          <div className="lb-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt={name} />
            <div className="lb-bar">
              <span className="lb-name">{name}</span>
              <span className="lb-actions">
                <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => {
                    clear();
                    setLightbox(null);
                  }}
                >
                  Remove
                </button>
                <button type="button" className="lb-close" onClick={() => setLightbox(null)} aria-label="Close preview">
                  ✕
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
