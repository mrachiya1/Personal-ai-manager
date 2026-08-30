"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectRow } from "@/lib/projectsAnalytics";
import { HIGHLIGHTS } from "@/lib/projectSchema";

/**
 * Everything about one project, in one place — and somewhere to write.
 *
 * The table row is a summary: ten columns, each one a fact. This is where the
 * things that do not fit a column live. Notes above all, because a project
 * accumulates decisions ("client approved the slower sting", "reshoot the
 * turntable once the material lands") that belong with the project rather
 * than in a separate notes app where nobody will look for them again.
 *
 * Notes save on a debounce and on close. A Save button here would be a button
 * people forget, and losing three paragraphs to a forgotten button is the
 * kind of thing that stops someone using a tool for good.
 */
export default function DetailsPanel({
  row,
  currency,
  onSaveNotes,
  onHighlight,
  onOpenResources,
  onClose,
}: {
  row: ProjectRow;
  currency: string;
  onSaveNotes: (notes: string) => Promise<void>;
  onHighlight: (name: string) => void;
  onOpenResources: () => void;
  onClose: () => void;
}) {
  const p = row.project;
  const [notes, setNotes] = useState(p.notes || "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(notes);
  const savedValue = useRef(p.notes || "");
  latest.current = notes;

  const save = async (value: string) => {
    if (value === savedValue.current) return;
    setState("saving");
    try {
      await onSaveNotes(value);
      savedValue.current = value;
      setState("saved");
      setMessage(null);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Couldn't save your note");
    }
  };

  function onChange(value: string) {
    setNotes(value);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 900);
  }

  // Escape closes, and closing saves whatever is unsaved. The cleanup runs on
  // unmount too, so the browser tab closing mid-sentence still writes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
      void save(latest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (n?: number) =>
    n === undefined || n === null
      ? "—"
      : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const date = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
  const highlight = HIGHLIGHTS.find((h) => h.name === p.highlight);

  const facts: [string, React.ReactNode][] = [
    ["Company", row.company?.name || "Personal / internal"],
    ["Client", row.client?.name || "—"],
    ["Status", p.status],
    ["Value", money(p.value)],
    ["Start", date(p.startDate)],
    ["Deadline", date(p.deadline)],
    ["Render priority", p.renderPriority || "—"],
    ["Estimated render", p.estimatedRenderHours ? `${p.estimatedRenderHours} h` : "—"],
    ["Category", p.category.length ? p.category.join(", ") : "—"],
    ["Assigned", row.assignees.length ? row.assignees.map((a) => a.name).join(", ") : "—"],
    ["Invoiced", `${money(row.payment.invoiced)} · ${row.payment.state.toLowerCase()}`],
    ["Last reviewed", date(p.lastReviewed)],
  ];

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal dp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div className="dp-head">
            <h2>{p.name}</h2>
            <p className="modal-sub">
              {p.headline || row.company?.name || "Personal / internal R&D"}
              {row.taskCount > 0 && ` · ${row.doneCount}/${row.taskCount} done`}
            </p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="dp-body">
          <section className="dp-notes">
            <div className="dp-notes-head">
              <label htmlFor="dp-notes-field">Notes</label>
              <span className={`dp-save ${state}`}>
                {state === "saving" && "Saving…"}
                {state === "saved" && "Saved to Notion"}
                {state === "error" && (message || "Not saved")}
                {state === "idle" && notes !== savedValue.current && "Unsaved"}
              </span>
            </div>
            <textarea
              id="dp-notes-field"
              className="dp-notes-field"
              value={notes}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => save(latest.current)}
              placeholder="What was decided, what the client actually wants, what to watch for. Saved to the project's Notes property in Notion."
              rows={7}
            />
          </section>

          <section className="dp-mark">
            <span className="dp-label">Highlight</span>
            <div className="dp-chips">
              {HIGHLIGHTS.map((h) => (
                <button
                  key={h.name}
                  type="button"
                  className={`dp-chip ${h.tone}${p.highlight === h.name ? " on" : ""}`}
                  onClick={() => onHighlight(p.highlight === h.name ? "" : h.name)}
                  aria-pressed={p.highlight === h.name}
                  title={h.hint}
                >
                  <span className="hl-dot" aria-hidden />
                  {h.name}
                </button>
              ))}
            </div>
            {highlight && <p className="dp-hint">{highlight.hint}</p>}
          </section>

          <section className="dp-facts">
            <span className="dp-label">Details</span>
            <dl>
              {facts.map(([k, v]) => (
                <div key={k} className="dp-fact">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {p.description && (
            <section className="dp-block">
              <span className="dp-label">Description</span>
              <p>{p.description}</p>
            </section>
          )}
          {p.clientRequests && (
            <section className="dp-block">
              <span className="dp-label">Client requests</span>
              <p>{p.clientRequests}</p>
            </section>
          )}

          <section className="dp-block">
            <span className="dp-label">Breakdown</span>
            {row.taskCount ? (
              <ul className="dp-tasks">
                {row.tree.roots.slice(0, 8).map((node) => (
                  <li key={node.task.id} className={node.task.status === "Done" ? "done" : ""}>
                    <span className="dp-task-title">{node.task.title}</span>
                    {node.children.length > 0 && (
                      <span className="dp-task-count">
                        {node.doneLeafCount}/{node.leafCount}
                      </span>
                    )}
                    <span className="dp-task-status">{node.task.status}</span>
                  </li>
                ))}
                {row.tree.roots.length > 8 && <li className="dp-more">+{row.tree.roots.length - 8} more</li>}
              </ul>
            ) : (
              <p className="dp-empty">Nothing broken down yet.</p>
            )}
          </section>
        </div>

        <footer className="dp-foot">
          <button className="btn-discard" type="button" onClick={onOpenResources}>
            Resources &amp; links{p.files.length ? ` (${p.files.length})` : ""}
          </button>
          <button className="btn-save" type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
