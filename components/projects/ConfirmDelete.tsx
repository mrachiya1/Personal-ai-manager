"use client";

import { useEffect, useState } from "react";

/**
 * The confirm step before a project goes.
 *
 * It names what is actually lost — the project, its sub-tasks, and the
 * attachments on the page — because "are you sure?" is not information. It
 * also says where the data goes, since Notion has no hard delete over the
 * API: the page is archived, which is what Notion's own trash button does,
 * and it stays recoverable for thirty days. Promising permanence the API
 * cannot deliver would be worse than being specific.
 */
export default function ConfirmDelete({
  projectName,
  taskCount,
  fileCount,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  taskCount: number;
  fileCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const carries = [
    taskCount > 0 ? `${taskCount} sub-${taskCount === 1 ? "task" : "tasks"}` : null,
    fileCount > 0 ? `${fileCount} ${fileCount === 1 ? "attachment" : "attachments"}` : null,
  ].filter(Boolean);

  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="modal cd-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="cd-title">
        <h2 id="cd-title">Delete project</h2>
        <div className="modal-sub">{projectName}</div>

        <div className="cd-warning">
          <span className="cd-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </span>
          <div>
            <p>
              This removes the project from Orex OS
              {carries.length ? ` along with its ${carries.join(" and ")}` : ""}.
            </p>
            <p className="cd-fine">
              In Notion the pages are <strong>archived</strong>, not erased — Notion&rsquo;s API has no hard delete. You
              can restore them from Notion&rsquo;s trash for about 30 days.
            </p>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-discard" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
