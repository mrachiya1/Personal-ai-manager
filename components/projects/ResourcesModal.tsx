"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectFile } from "@/lib/types";
import ProjectFiles from "./ProjectFiles";

/**
 * Everything attached to a project, in one place.
 *
 * Links and files share a tab strip because they share a home: Notion's files
 * property holds both uploaded files and external URLs, so a project's
 * resources are one list here and one list in Notion. Inventing a separate
 * "links" property would have split them.
 */

type Tab = "links" | "files";

/** Which service a URL belongs to, for the icon and the label. */
function platformOf(url: string): { key: string; label: string } {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { key: "web", label: "Link" };
  }
  if (/figma\.com$/.test(host)) return { key: "figma", label: "Figma" };
  if (/(drive|docs|sheets|slides)\.google\.com$/.test(host)) return { key: "drive", label: "Google Drive" };
  if (/github\.com$/.test(host)) return { key: "github", label: "GitHub" };
  if (/notion\.(so|site)$/.test(host)) return { key: "notion", label: "Notion" };
  if (/(youtube\.com|youtu\.be|vimeo\.com|frame\.io)$/.test(host)) return { key: "video", label: "Video" };
  if (/dropbox\.com$/.test(host)) return { key: "drive", label: "Dropbox" };
  return { key: "web", label: host || "Link" };
}

function PlatformIcon({ kind }: { kind: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "figma":
      return (
        <svg {...common}>
          <path d="M8.5 2h3.5v6H8.5a3 3 0 0 1 0-6ZM12 2h3.5a3 3 0 0 1 0 6H12V2ZM12 8h3.5a3 3 0 1 1-3.5 3V8ZM8.5 8H12v6H8.5a3 3 0 0 1 0-6ZM8.5 14H12v3a3 3 0 1 1-3.5-3Z" />
        </svg>
      );
    case "drive":
      return (
        <svg {...common}>
          <path d="m8 3 8 14M16 3 8 17M3 17h18" />
        </svg>
      );
    case "github":
      return (
        <svg {...common}>
          <path d="M9 19c-4 1.4-4-2.1-6-2.6m12 4.6v-3.5a3 3 0 0 0-.9-2.4c3-.3 6.1-1.4 6.1-6.4a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C5.8 1.4 4.7 1.7 4.7 1.7a4.6 4.6 0 0 0-.1 3.5A5 5 0 0 0 3.2 8.7c0 5 3 6.1 6 6.4a3 3 0 0 0-.9 2.3V21" />
        </svg>
      );
    case "notion":
      return (
        <svg {...common}>
          <path d="M4 4.5 15 3.6a2 2 0 0 1 1.6.5l3 2.6a1 1 0 0 1 .4.8V19a1 1 0 0 1-.9 1L7 21a2 2 0 0 1-1.6-.6l-1.1-1.4a1 1 0 0 1-.3-.7V5.5a1 1 0 0 1 1-1Z" />
          <path d="M8 8.5v7M8 8.5l5 7M13 8v7" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="14" height="14" rx="2" />
          <path d="m22 8-6 4 6 4V8Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      );
  }
}

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
  const [tab, setTab] = useState<Tab>("links");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState(files);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const links = rows.filter((f) => f.kind === "external");
  const uploads = rows.filter((f) => f.kind !== "external");

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't attach that link");
      setRows((prev) => [...prev, { name: data.name, url: data.url, kind: "external" }]);
      setLabel("");
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't attach that link");
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(name: string) {
    const before = rows;
    setRows((prev) => prev.filter((f) => f.name !== name));
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't remove that");
      router.refresh();
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : "Couldn't remove that");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Resources</h2>
        <div className="modal-sub">{projectName}</div>

        <div className="rm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "links"} className={`rm-tab${tab === "links" ? " on" : ""}`} onClick={() => setTab("links")}>
            Links <span className="rm-count">{links.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "files"} className={`rm-tab${tab === "files" ? " on" : ""}`} onClick={() => setTab("files")}>
            Files <span className="rm-count">{uploads.length}</span>
          </button>
        </div>

        {tab === "links" ? (
          <>
            <form className="rm-form" onSubmit={addLink}>
              <input
                className="rm-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://figma.com/file/… or a Drive folder, PR, live demo"
              />
              <input
                className="rm-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional)"
              />
              <button type="submit" className="btn-save" disabled={saving || !url.trim()}>
                {saving ? "Adding…" : "Attach"}
              </button>
            </form>

            {links.length === 0 ? (
              <div className="rm-empty">
                No links yet. Design files, drive folders, pull requests and live URLs all belong here — they stay on
                the project page in Notion too.
              </div>
            ) : (
              <ul className="rm-list">
                {links.map((link) => {
                  const platform = platformOf(link.url);
                  return (
                    <li key={link.name} className="rm-item">
                      <span className={`rm-icon ${platform.key}`}>
                        <PlatformIcon kind={platform.key} />
                      </span>
                      <span className="rm-body">
                        <a href={link.url} target="_blank" rel="noreferrer" className="rm-name">
                          {link.name}
                        </a>
                        <span className="rm-host">{platform.label}</span>
                      </span>
                      <button className="link-btn" onClick={() => removeLink(link.name)} style={{ color: "var(--ink-muted)" }}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <ProjectFiles projectId={projectId} files={uploads} companyName={companyName} projectName={projectName} />
        )}

        {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-save" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
