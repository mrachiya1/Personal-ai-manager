"use client";

import type { ProjectRow } from "@/lib/projectsAnalytics";
import type { CustomProperty } from "@/lib/customProps";
import AddPropertyButton from "./AddPropertyButton";
import { DateCell, NumberCell, SelectCell, TextCell } from "./editable";

/**
 * The workspace's own Notion properties, for one project.
 *
 * They used to be columns. That is the right answer for two of them and the
 * wrong answer for ten: a Notion database accumulates properties over time,
 * and a table that gives each one a column gets narrower every month until
 * the project name is three letters and an ellipsis. Here they are a list,
 * where a workspace with fifteen custom fields is a longer list rather than
 * an unreadable table.
 */
export default function PropertiesModal({
  row,
  custom,
  onPatch,
  onClose,
}: {
  row: ProjectRow;
  custom: CustomProperty[];
  onPatch: (name: string, prop: CustomProperty, value: unknown) => void;
  onClose: () => void;
}) {
  const p = row.project;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal pm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h2>Properties</h2>
            <p className="modal-sub">{p.name}</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="pm-list">
          {custom.length === 0 && (
            <p className="empty-line">
              This database has no properties beyond the ones the table already shows. Add one below and it appears
              here for every project.
            </p>
          )}
          {custom.map((prop) => {
            const value = p.custom?.[prop.name];
            return (
              <label className="pm-field" key={prop.name}>
                <span className="pm-label">
                  {prop.name}
                  <span className="pm-type">{prop.type.replace(/_/g, " ")}</span>
                </span>
                <span className="pm-value">
                  {!prop.editable ? (
                    <span className="pm-readonly" title="Notion computes this one — it can't be written from here">
                      {String(value ?? "—")}
                    </span>
                  ) : prop.type === "checkbox" ? (
                    <button
                      type="button"
                      className={`pt-check standalone${value ? " on" : ""}`}
                      aria-pressed={Boolean(value)}
                      onClick={() => onPatch(prop.name, prop, !value)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    </button>
                  ) : prop.type === "number" ? (
                    <NumberCell value={value as number} onSave={(v) => onPatch(prop.name, prop, v)} />
                  ) : prop.type === "date" ? (
                    <DateCell value={value as string} onSave={(v) => onPatch(prop.name, prop, v)} />
                  ) : prop.type === "select" || prop.type === "status" ? (
                    <SelectCell
                      value={value as string}
                      options={prop.options ?? []}
                      heading={prop.name}
                      onSave={(v) => onPatch(prop.name, prop, v)}
                    />
                  ) : (
                    <TextCell value={String(value ?? "")} onSave={(v) => onPatch(prop.name, prop, v)} />
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <footer className="pm-foot">
          <AddPropertyButton />
          <span className="pm-note">Adds a property to the Notion database, for every project.</span>
        </footer>
      </div>
    </div>
  );
}
