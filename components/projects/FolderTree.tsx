"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientRecord, Company, Project } from "@/lib/types";

/**
 * Company → Client → Project, as a file explorer.
 *
 * The table answers "what needs attention across everything". This answers the
 * other question — "show me everything for this client" — which a flat list
 * makes you scan for. Which branches are open is remembered per browser, since
 * people return to the same two or three.
 */
export default function FolderTree({
  projects,
  companies,
  clients,
  clientFor,
  selectedId,
  onSelect,
  counts,
}: {
  projects: Project[];
  companies: Company[];
  clients: ClientRecord[];
  clientFor: (p: Project) => string;
  selectedId?: string;
  onSelect: (p: Project) => void;
  counts: { overdue: (p: Project) => boolean };
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("orex-folder-open");
      if (raw) setOpen(JSON.parse(raw));
    } catch {}
  }, []);

  function toggle(key: string) {
    setOpen((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? true) };
      try {
        localStorage.setItem("orex-folder-open", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const isOpen = (key: string) => open[key] ?? true;

  const tree = useMemo(() => {
    const byCompany = new Map<string, Map<string, Project[]>>();
    for (const p of projects) {
      const cid = p.companyId || "";
      const clid = clientFor(p) || "";
      if (!byCompany.has(cid)) byCompany.set(cid, new Map());
      const inner = byCompany.get(cid)!;
      if (!inner.has(clid)) inner.set(clid, []);
      inner.get(clid)!.push(p);
    }
    return byCompany;
  }, [projects, clientFor]);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name || "No company";
  const companyColor = (id: string) => companies.find((c) => c.id === id)?.colorVar;
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "No client";

  return (
    <div className="pw-tree">
      {[...tree.entries()]
        .sort((a, b) => companyName(a[0]).localeCompare(companyName(b[0])))
        .map(([cid, clientMap]) => {
          const total = [...clientMap.values()].reduce((s, l) => s + l.length, 0);
          const key = `co:${cid}`;
          return (
            <div key={key}>
              <button className="pw-tree-row lvl0" onClick={() => toggle(key)} type="button">
                <Caret open={isOpen(key)} />
                <span
                  className="nav-swatch"
                  style={{ ["--swatch-color" as string]: companyColor(cid) ? `var(${companyColor(cid)})` : "var(--ink-muted)" }}
                />
                <span className="pw-tree-label">{companyName(cid)}</span>
                <span className="count-chip">{total}</span>
              </button>

              {isOpen(key) &&
                [...clientMap.entries()]
                  .sort((a, b) => clientName(a[0]).localeCompare(clientName(b[0])))
                  .map(([clid, list]) => {
                    const ckey = `${key}/cl:${clid}`;
                    return (
                      <div key={ckey}>
                        <button className="pw-tree-row lvl1" onClick={() => toggle(ckey)} type="button">
                          <Caret open={isOpen(ckey)} />
                          <FolderIcon />
                          <span className="pw-tree-label">{clientName(clid)}</span>
                          <span className="count-chip">{list.length}</span>
                        </button>

                        {isOpen(ckey) &&
                          list
                            .slice()
                            .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
                            .map((p) => (
                              <button
                                key={p.id}
                                className={`pw-tree-row lvl2${selectedId === p.id ? " on" : ""}`}
                                onClick={() => onSelect(p)}
                                type="button"
                              >
                                <span style={{ width: 12, flexShrink: 0 }} />
                                <DocIcon />
                                <span className="pw-tree-label">{p.name}</span>
                                {counts.overdue(p) && <span className="pw-days late">late</span>}
                                {p.files.length > 0 && (
                                  <span className="count-chip" title={`${p.files.length} file(s)`}>
                                    <ClipIcon />
                                    {p.files.length}
                                  </span>
                                )}
                              </button>
                            ))}
                      </div>
                    );
                  })}
            </div>
          );
        })}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className="pw-caret"
      style={{ transform: open ? "rotate(90deg)" : "none" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg className="pw-tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg className="pw-tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.2-9.2a3.67 3.67 0 0 1 5.18 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.6-2.6l8.5-8.48" />
    </svg>
  );
}
