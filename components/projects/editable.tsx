"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ==================================================================
   Notion-style inline editing.

   Three things make a table feel like Notion rather than like a form:
   a cell looks like text until you touch it, a change is on screen before
   the network knows about it, and the keyboard can reach everywhere the
   mouse can. All three are here.
   ================================================================== */

/* ------------------------------------------------------------------ */
/* Keyboard grid                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every editable cell carries its coordinates in the DOM, and arrow keys
 * move focus between them by querying for the neighbour.
 *
 * Coordinates in the DOM rather than in React state on purpose: rows expand,
 * collapse and re-sort, and a focus index held in state goes stale the moment
 * they do. The DOM is the only thing that always knows what is actually on
 * screen.
 */
export interface CellNav {
  row: number;
  col: number;
}

export function navAttrs(nav?: CellNav) {
  if (!nav) return {};
  return { "data-cell-row": nav.row, "data-cell-col": nav.col, tabIndex: 0 } as const;
}

function move(from: HTMLElement, dRow: number, dCol: number) {
  const grid = from.closest("[data-cell-grid]");
  if (!grid) return false;
  const row = Number(from.getAttribute("data-cell-row"));
  const col = Number(from.getAttribute("data-cell-col"));
  if (Number.isNaN(row) || Number.isNaN(col)) return false;

  const cells = [...grid.querySelectorAll<HTMLElement>("[data-cell-row]")];
  const at = (r: number, c: number) =>
    cells.find((el) => Number(el.dataset.cellRow) === r && Number(el.dataset.cellCol) === c);

  if (dCol) {
    // Walk along the row; if it runs out, wrap to the next row's first cell,
    // which is what Tab would do and what people expect.
    const sameRow = cells
      .filter((el) => Number(el.dataset.cellRow) === row)
      .sort((a, b) => Number(a.dataset.cellCol) - Number(b.dataset.cellCol));
    const idx = sameRow.indexOf(from);
    const next = sameRow[idx + dCol];
    if (next) {
      next.focus();
      return true;
    }
  }

  if (dRow) {
    // Rows are not always contiguous — an expanded project inserts a detail
    // row between them — so scan outward rather than assuming row ± 1.
    const rows = [...new Set(cells.map((el) => Number(el.dataset.cellRow)))].sort((a, b) => a - b);
    const here = rows.indexOf(row);
    for (let i = here + dRow; i >= 0 && i < rows.length; i += dRow) {
      const target = at(rows[i], col) ?? at(rows[i], 0);
      if (target) {
        target.focus();
        return true;
      }
    }
  }
  return false;
}

/** Arrow-key handling shared by every cell. Returns true if it consumed the key. */
function handleArrows(e: React.KeyboardEvent<HTMLElement>): boolean {
  const map: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
  };
  const delta = map[e.key];
  if (!delta) return false;
  if (move(e.currentTarget, delta[0], delta[1])) {
    e.preventDefault();
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Debounce                                                            */
/* ------------------------------------------------------------------ */

/**
 * Saves 400ms after typing stops, and immediately on commit.
 *
 * Debouncing a Notion write matters more than it would elsewhere: the API
 * rate-limits at roughly three requests a second, and a per-keystroke save on
 * a project name would burn that budget on a single field.
 */
function useDebounced<T>(save: (value: T) => void, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      const { value } = pending.current;
      pending.current = null;
      saveRef.current(value);
    }
  }, []);

  const queue = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [flush, ms]
  );

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { queue, flush, cancel };
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function TextCell({
  value,
  onSave,
  placeholder = "Empty",
  bold = false,
  nav,
  debounce = true,
  openWhen,
  onOpened,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  bold?: boolean;
  nav?: CellNav;
  debounce?: boolean;
  /** Set true to drop straight into edit mode — the ··· menu's "Rename". */
  openWhen?: boolean;
  /** Called once the cell has taken the hint, so the caller can clear it. */
  onOpened?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const { queue, flush, cancel } = useDebounced<string>((v) => {
    if (v !== value) onSave(v);
  });

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  // "Rename" from the row menu is the same edit the cell already does; it
  // just starts it from somewhere else. A second rename dialog would be a
  // second place for the save logic to drift.
  useEffect(() => {
    if (openWhen) {
      setEditing(true);
      onOpened?.();
    }
  }, [openWhen, onOpened]);

  function stop(commit: boolean) {
    setEditing(false);
    if (commit) flush();
    else {
      cancel();
      setDraft(value);
    }
    // Focus returns to the cell, so the keyboard can keep moving from here.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        nav ? `[data-cell-row="${nav.row}"][data-cell-col="${nav.col}"]` : ""
      );
      el?.focus();
    });
  }

  if (editing) {
    return (
      <input
        ref={ref}
        className="ed-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (debounce) queue(e.target.value.trim());
        }}
        onBlur={() => stop(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!debounce) queue(draft.trim());
            stop(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            stop(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`ed-cell${value ? "" : " empty"}`}
      style={bold ? { fontWeight: 600, color: "var(--ink)" } : undefined}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (handleArrows(e)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      {...navAttrs(nav)}
    >
      <span className="ed-text">{value || placeholder}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Number                                                              */
/* ------------------------------------------------------------------ */

export function NumberCell({
  value,
  onSave,
  prefix = "",
  placeholder = "—",
  nav,
}: {
  value?: number;
  onSave: (v: number | undefined) => void;
  prefix?: string;
  placeholder?: string;
  nav?: CellNav;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value === undefined ? "" : String(value));
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === "" ? undefined : Number(trimmed.replace(/[^0-9.\-]/g, ""));
    if (next !== undefined && !Number.isFinite(next)) return;
    if (next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        className="ed-input num"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { setDraft(value === undefined ? "" : String(value)); setEditing(false); }
        }}
      />
    );
  }

  return (
    <div
      className={`ed-cell num${value === undefined ? " empty" : ""}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (handleArrows(e)) return;
        if (e.key === "Enter") { e.preventDefault(); setEditing(true); }
      }}
      {...navAttrs(nav)}
    >
      {value === undefined ? placeholder : `${prefix}${value.toLocaleString()}`}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Popover shell                                                       */
/* ------------------------------------------------------------------ */

export function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  /*
    Rendered into the document body, positioned fixed, and flipped when there
    is no room below.

    It used to be absolutely positioned inside the cell, which meant any
    ancestor with `overflow:hidden` clipped it — and the Projects section card
    had exactly that. A status dropdown on the last row of a section opened
    into nothing: the panel was there, it was just cut off, so the options
    could not be clicked. Every such ancestor is a latent version of that bug,
    so the panel now escapes all of them.

    The zero-size anchor stays behind in the original position; its parent's
    rect is what the panel is placed against.
  */
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const host = anchor.current?.parentElement;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const h = panel.current?.offsetHeight ?? 240;
    const gap = 5;
    const roomBelow = window.innerHeight - r.bottom;
    // Flip up only when below genuinely doesn't fit AND above does — a panel
    // that flips into an even smaller space is not an improvement.
    const above = roomBelow < h + gap + 8 && r.top > roomBelow;
    const width = Math.max(r.width, 190);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    setPos({
      top: above ? Math.max(8, r.top - h - gap) : r.bottom + gap,
      left: Math.max(8, left),
      width,
      above,
    });
  }, []);

  useEffect(() => {
    place();
    // A second pass once the panel has real height, so a flip is decided on
    // the measurement rather than on the 240px guess.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [place]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Scrolling moves the cell; the panel follows rather than detaching.
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [onClose, place]);

  const body = (
    <>
      <div className="ed-pop-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`ed-pop${pos?.above ? " above" : ""}`}
        style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width } : { opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );

  return (
    <>
      <span ref={anchor} className="ed-pop-anchor" aria-hidden />
      {mounted && createPortal(body, document.body)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */

export function DateCell({
  value,
  onSave,
  placeholder = "—",
  tone,
  open,
  onOpenChange,
  nav,
  format,
}: {
  value?: string;
  onSave: (v: string) => void;
  placeholder?: string;
  tone?: "late" | "soon" | null;
  /** How to render the date. Defaults to a readable long form. */
  format?: (iso?: string) => string | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  nav?: CellNav;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  const label =
    (value ? (format ? format(value) : undefined) : undefined) ??
    (value
      ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : placeholder);

  return (
    <div style={{ position: "relative" }}>
      <div
        className={`ed-cell is-picker${value ? "" : " empty"}${tone ? ` tone-${tone}` : ""}${isOpen ? " is-open" : ""}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (handleArrows(e)) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
        }}
        {...navAttrs(nav)}
      >
        <span className="ed-text">{label}</span>
      </div>
      {isOpen && (
        <Popover onClose={() => setOpen(false)}>
          <div className="ed-pop-head">Pick a date</div>
          <input
            type="date"
            className="ed-date-input"
            autoFocus
            defaultValue={value || ""}
            onChange={(e) => {
              onSave(e.target.value);
              setOpen(false);
            }}
          />
          {value && (
            <button className="ed-opt danger" onClick={() => { onSave(""); setOpen(false); }}>
              Clear date
            </button>
          )}
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single-choice badge                                                 */
/* ------------------------------------------------------------------ */

export function SelectCell({
  value,
  options,
  onSave,
  render,
  placeholder = "—",
  allowEmpty = true,
  open,
  onOpenChange,
  nav,
  heading,
}: {
  value?: string;
  options: string[];
  onSave: (v: string) => void;
  render?: (v: string) => ReactNode;
  placeholder?: string;
  allowEmpty?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  nav?: CellNav;
  heading?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <div style={{ position: "relative" }}>
      <div
        className={`ed-cell is-picker${value ? "" : " empty"}${isOpen ? " is-open" : ""}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (handleArrows(e)) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
        }}
        {...navAttrs(nav)}
      >
        {value ? (render ? render(value) : value) : placeholder}
        <Chevron />
      </div>
      {isOpen && (
        <Popover onClose={() => setOpen(false)}>
          {heading && <div className="ed-pop-head">{heading}</div>}
          {allowEmpty && (
            <button className={`ed-opt${!value ? " on" : ""}`} onClick={() => { onSave(""); setOpen(false); }}>
              <span style={{ color: "var(--ink-muted)" }}>Clear</span>
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt}
              className={`ed-opt${opt === value ? " on" : ""}`}
              onClick={() => { onSave(opt); setOpen(false); }}
            >
              {render ? render(opt) : opt}
              {opt === value && <Tick />}
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-choice                                                        */
/* ------------------------------------------------------------------ */

export interface PickOption {
  id: string;
  label: string;
  colorSeed?: string;
}

export function MultiPickCell({
  selected,
  options,
  onSave,
  renderClosed,
  placeholder = "—",
  searchable = false,
  heading,
  open,
  onOpenChange,
  query,
  onQueryChange,
  nav,
}: {
  selected: string[];
  options: PickOption[];
  onSave: (ids: string[]) => void;
  renderClosed: (chosen: PickOption[]) => ReactNode;
  placeholder?: string;
  searchable?: boolean;
  heading?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  query?: string;
  onQueryChange?: (q: string) => void;
  nav?: CellNav;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [ownQ, setOwnQ] = useState("");
  const q = query ?? ownQ;
  const setQ = onQueryChange ?? setOwnQ;

  const chosen = selected.map((id) => options.find((o) => o.id === id)).filter(Boolean) as PickOption[];
  const visible = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;

  return (
    <div style={{ position: "relative" }}>
      <div
        className={`ed-cell is-picker${chosen.length ? "" : " empty"}${isOpen ? " is-open" : ""}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (handleArrows(e)) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
        }}
        {...navAttrs(nav)}
      >
        {chosen.length ? renderClosed(chosen) : placeholder}
        <Chevron />
      </div>
      {isOpen && (
        <Popover onClose={() => { setOpen(false); setQ(""); }}>
          {heading && <div className="ed-pop-head">{heading}</div>}
          {searchable && (
            <input
              className="ed-pop-search"
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {visible.length === 0 && <div className="ed-pop-empty">Nothing matches</div>}
          {visible.map((opt) => (
            <button
              key={opt.id}
              className={`ed-opt${selected.includes(opt.id) ? " on" : ""}`}
              onClick={() =>
                // Saves on every tick rather than on close, so a dropped
                // connection loses one choice instead of the whole edit.
                onSave(selected.includes(opt.id) ? selected.filter((x) => x !== opt.id) : [...selected, opt.id])
              }
            >
              {opt.label}
              {selected.includes(opt.id) && <Tick />}
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function Chevron() {
  return (
    <svg className="ed-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="ed-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
