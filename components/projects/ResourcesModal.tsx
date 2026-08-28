"use client";

import { useEffect } from "react";
import type { ProjectFile } from "@/lib/types";
import ProjectFiles from "./ProjectFiles";

/** The attachments on a project, without leaving the table. */
export default function ResourcesModal({
  projectId,
  projectName,
  companyName,
  files,
  onClose,
}: {
  projectId: string;
  projectName: string;
  companyName?: string;
  files: ProjectFile[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Resources</h2>
        <div className="modal-sub">{projectName}</div>
        <ProjectFiles projectId={projectId} files={files} companyName={companyName} projectName={projectName} />
        <div className="form-actions">
          <button type="button" className="btn-save" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
