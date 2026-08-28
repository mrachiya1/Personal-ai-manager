"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectFile } from "@/lib/types";

/** How many files one folder pick will send before stopping and saying so. */
const FOLDER_LIMIT = 25;

/**
 * The file area inside a project.
 *
 * Files live on the Notion page, so they are visible in Notion too and there
 * is no second copy of the truth. Notion's download URLs are signed and expire
 * after roughly an hour, which is why nothing here caches them — every render
 * gets fresh ones from the page read.
 */
export default function ProjectFiles({
  projectId,
  files,
  companyName,
  projectName,
}: {
  projectId: string;
  files: ProjectFile[];
  companyName?: string;
  projectName: string;
}) {
  const [rows, setRows] = useState<ProjectFile[]>(files);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const upload = useCallback(
    async (list: File[]) => {
      setError(null);
      if (!list.length) return;
      // A folder pick can be hundreds of files, and each one is three Notion
      // requests. Take the first batch and say so rather than hanging for ten
      // minutes or half-uploading and looking broken.
      let batch = list;
      if (batch.length > FOLDER_LIMIT) {
        batch = batch.slice(0, FOLDER_LIMIT);
        setError(`That folder has ${list.length} files. Uploading the first ${FOLDER_LIMIT} — add the rest in another pass.`);
      }
      // Sequential, not parallel: Notion rate-limits at around three requests a
      // second and each upload is three of them.
      for (const file of batch) {
        // A folder pick carries the path inside the chosen folder. Notion
        // attachments are a flat list, so the path is folded into the name —
        // with "›" rather than "/", which some storage layers strip — and the
        // file list renders it back as a crumb.
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        const name = rel ? rel.split("/").join(" › ") : file.name;
        setBusy(name);
        try {
          const form = new FormData();
          form.append("file", file, name);
          const res = await fetch(`/api/projects/${projectId}/files`, { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          setRows((prev) => [...prev, { name, url: "", kind: "file" }]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
          break;
        }
      }
      setBusy(null);
      router.refresh();
    },
    [projectId, router]
  );

  async function remove(name: string) {
    setBusy(name);
    setError(null);
    const before = rows;
    setRows((prev) => prev.filter((f) => f.name !== name));
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't remove that file");
      router.refresh();
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : "Couldn't remove that file");
    } finally {
      setBusy(null);
    }
  }

  const folder = [companyName || "No company", projectName].join(" / ");

  return (
    <div>
      <div className="pw-field-label" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span>Files</span>
        <span className="pw-folder-crumb">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
          {folder}
        </span>
      </div>

      {rows.length > 0 && (
        <div style={{ marginBottom: 9 }}>
          {rows.map((f) => (
            <div key={f.name} className="pw-file-row">
              <span className="pw-file-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6" />
                </svg>
              </span>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="pw-file-name">
                  <FileName name={f.name} />
                </a>
              ) : (
                <span className="pw-file-name" style={{ color: "var(--ink-muted)" }}>
                  <FileName name={f.name} /> · saving…
                </span>
              )}
              {f.kind === "external" && <span className="type-pill">link</span>}
              <button
                className="link-btn"
                type="button"
                onClick={() => remove(f.name)}
                disabled={busy === f.name}
                style={{ marginLeft: "auto", color: "var(--ink-muted)" }}
              >
                {busy === f.name ? "…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`pw-drop${dragging ? " on" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            upload(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          hidden
          // Non-standard but supported everywhere that matters; React needs the
          // lowercase attribute name to pass it through to the DOM.
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => {
            upload(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        {busy ? (
          `Uploading ${busy}…`
        ) : (
          <>
            Drop briefs, contracts or deliverables here
            <span className="pw-drop-alt">
              <button type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                Choose files
              </button>
              <span aria-hidden>·</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }}>
                Choose a folder
              </button>
            </span>
          </>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11.5, color: "var(--critical-ink)", marginTop: 6, lineHeight: 1.5 }}>{error}</div>
      )}
      <div style={{ fontSize: 10.5, color: "var(--ink-muted)", marginTop: 6, lineHeight: 1.5 }}>
        Stored on the Notion page, so they show up in Notion too. 5MB each on Notion&apos;s free plan.
        A folder keeps its structure in the file name, up to {FOLDER_LIMIT} files at a time.
      </div>
    </div>
  );
}

/** Renders a folded folder path ("brief › v2 › script.pdf") as a dimmed crumb
 *  plus the file name, so a folder upload still reads as a folder. */
function FileName({ name }: { name: string }) {
  const parts = name.split(" › ");
  if (parts.length === 1) return <>{name}</>;
  return (
    <>
      <span style={{ color: "var(--ink-muted)" }}>{parts.slice(0, -1).join(" › ")} › </span>
      {parts[parts.length - 1]}
    </>
  );
}
