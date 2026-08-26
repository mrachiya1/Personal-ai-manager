"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, Company } from "@/lib/types";

const CATEGORIES = ["Subscription", "Software", "Fuel", "Salary", "Rent", "Donation", "Other"];
const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "INR", "AUD"];

/** How many slips are sent to the vision model at once. */
const CONCURRENCY = 3;

interface LineItem {
  description?: string;
  quantity?: number;
  amount?: number;
}

interface SlipFields {
  name: string;
  vendor: string;
  amount: string;
  currency: string;
  date: string;
  category: string;
  companyId: string;
  accountId: string;
  notes: string;
  recurring: boolean;
}

interface Slip {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "scanning" | "ready" | "error" | "saving" | "saved";
  error?: string;
  fields: SlipFields;
  confidence?: string;
  documentType?: string;
  reference?: string;
  paymentMethod?: string;
  taxAmount?: number;
  lineItems?: LineItem[];
  expanded?: boolean;
}

function emptyFields(fileName: string): SlipFields {
  return {
    name: fileName.replace(/\.[^.]+$/, "").slice(0, 60),
    vendor: "",
    amount: "",
    currency: "LKR",
    date: new Date().toISOString().slice(0, 10),
    category: "Other",
    companyId: "",
    accountId: "",
    notes: "",
    recurring: false,
  };
}

let counter = 0;
function nextId() {
  counter += 1;
  return `slip-${Date.now()}-${counter}`;
}

const STATUS_META: Record<Slip["status"], { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "badge pending" },
  scanning: { label: "Reading…", cls: "badge med" },
  ready: { label: "Ready", cls: "badge low" },
  error: { label: "Failed", cls: "badge high" },
  saving: { label: "Saving…", cls: "badge med" },
  saved: { label: "Saved", cls: "badge paid" },
};

export default function SlipInbox({
  companies,
  accounts,
}: {
  companies: Company[];
  accounts: Account[];
}) {
  const [slips, setSlips] = useState<Slip[]>([]);
  const [dragging, setDragging] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Revoke object URLs on unmount so a long session doesn't leak blobs.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const patch = useCallback((id: string, changes: Partial<Slip>) => {
    setSlips((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  }, []);

  const patchFields = useCallback((id: string, changes: Partial<SlipFields>) => {
    setSlips((prev) => prev.map((s) => (s.id === id ? { ...s, fields: { ...s.fields, ...changes } } : s)));
  }, []);

  const scan = useCallback(
    async (slip: Slip) => {
      patch(slip.id, { status: "scanning", error: undefined });
      try {
        const form = new FormData();
        form.append("file", slip.file);
        const res = await fetch("/api/expenses/scan", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't read that slip");

        const ex = data.extracted || {};
        const matched = data.matched || {};

        setSlips((prev) =>
          prev.map((s) => {
            if (s.id !== slip.id) return s;
            return {
              ...s,
              status: "ready",
              confidence: ex.confidence,
              documentType: ex.documentType,
              reference: ex.referenceNumber,
              paymentMethod: ex.paymentMethod,
              taxAmount: typeof ex.taxAmount === "number" ? ex.taxAmount : undefined,
              lineItems: Array.isArray(ex.lineItems) ? ex.lineItems.slice(0, 12) : undefined,
              fields: {
                ...s.fields,
                name: ex.vendor || s.fields.name,
                vendor: ex.vendor || "",
                amount: ex.amount !== undefined && ex.amount !== null ? String(ex.amount) : "",
                currency: CURRENCIES.includes(ex.currency) ? ex.currency : s.fields.currency,
                date: ex.date || s.fields.date,
                category: CATEGORIES.includes(ex.category) ? ex.category : "Other",
                companyId: matched.companyId || "",
                accountId: matched.accountId || "",
                notes: [ex.referenceNumber ? `Ref ${ex.referenceNumber}` : "", ex.paymentMethod || "", ex.notes || ""]
                  .filter(Boolean)
                  .join(" · "),
              },
            };
          })
        );
      } catch (err) {
        patch(slip.id, { status: "error", error: err instanceof Error ? err.message : "Scan failed" });
      }
    },
    [patch]
  );

  /** Adds files and works through them a few at a time. */
  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
      if (images.length === 0) {
        setBanner({ kind: "err", text: "Those files aren't images. Photograph or screenshot the slip and drop it here." });
        return;
      }
      setBanner(null);

      const fresh: Slip[] = images.slice(0, 40).map((file) => {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        return { id: nextId(), file, previewUrl: url, status: "queued", fields: emptyFields(file.name) };
      });

      setSlips((prev) => [...prev, ...fresh]);

      // A simple sliding window: three in flight, the rest wait their turn.
      const queue = [...fresh];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next) await scan(next);
        }
      });
      await Promise.all(workers);
    },
    [scan]
  );

  // Paste a screenshot straight in — the fastest path for a bank slip.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.files || []);
      if (items.length) addFiles(items);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const readyCount = slips.filter((s) => s.status === "ready").length;
  const savedCount = slips.filter((s) => s.status === "saved").length;
  const total = useMemo(
    () =>
      slips
        .filter((s) => s.status === "ready")
        .reduce((sum, s) => sum + (Number(s.fields.amount) || 0), 0),
    [slips]
  );

  async function saveAll() {
    const pending = slips.filter((s) => s.status === "ready");
    if (pending.length === 0) return;
    setSavingAll(true);
    setBanner(null);
    setSlips((prev) => prev.map((s) => (s.status === "ready" ? { ...s, status: "saving" } : s)));

    try {
      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: pending.map((s) => ({
            name: s.fields.name.trim() || s.fields.vendor || "Untitled slip",
            vendor: s.fields.vendor,
            amount: Number(s.fields.amount),
            currency: s.fields.currency,
            date: s.fields.date,
            category: s.fields.category,
            companyId: s.fields.companyId || undefined,
            accountId: s.fields.accountId || undefined,
            notes: s.fields.notes,
            recurring: s.fields.recurring,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      const results: { index: number; ok: boolean; error?: string }[] = data.results || [];
      setSlips((prev) => {
        const next = [...prev];
        pending.forEach((slip, i) => {
          const r = results.find((x) => x.index === i);
          const idx = next.findIndex((s) => s.id === slip.id);
          if (idx === -1) return;
          next[idx] = r?.ok
            ? { ...next[idx], status: "saved" }
            : { ...next[idx], status: "error", error: r?.error || "Save failed" };
        });
        return next;
      });

      setBanner(
        data.failed > 0
          ? { kind: "err", text: `${data.saved} saved, ${data.failed} failed — fix the flagged rows and save again.` }
          : { kind: "ok", text: `${data.saved} slip${data.saved === 1 ? "" : "s"} saved to your Notion Expenses database.` }
      );
      router.refresh();
    } catch (err) {
      setSlips((prev) => prev.map((s) => (s.status === "saving" ? { ...s, status: "ready" } : s)));
      setBanner({ kind: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <>
      {/* ---------- Dropzone ---------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? "var(--ink)" : "var(--border-strong)"}`,
          background: dragging ? "var(--rail)" : "var(--surface-raised)",
          borderRadius: 14,
          padding: "30px 22px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 16,
          transition: "border-color 0.15s ease, background 0.15s ease",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <div
          style={{
            width: 42, height: 42, borderRadius: 12, margin: "0 auto 12px auto",
            background: "var(--rail)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-secondary)",
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
          </svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          Drop slips here, or click to choose
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 5, lineHeight: 1.6 }}>
          Receipts, bills, bank transfer slips, invoices — many at once. You can also paste a screenshot with ⌘V.
          <br />
          Each one is read by AI, then you check the numbers before anything is saved.
        </div>
      </div>

      {banner && (
        <div
          style={{
            fontSize: 12.5, lineHeight: 1.6, borderRadius: 10, padding: "11px 13px", marginBottom: 14,
            background: banner.kind === "ok" ? "var(--good-bg)" : "var(--critical-bg)",
            color: banner.kind === "ok" ? "#0a6b0a" : "#a12424",
            border: `1px solid ${banner.kind === "ok" ? "rgba(12,163,12,0.25)" : "rgba(208,59,59,0.25)"}`,
          }}
        >
          {banner.text}
        </div>
      )}

      {slips.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Review</span>
            <span className="count-chip">{slips.length}</span>
            {readyCount > 0 && (
              <span className="count-chip" style={{ fontVariantNumeric: "tabular-nums" }}>
                {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} total
              </span>
            )}
            {savedCount > 0 && <span className="badge paid">{savedCount} saved</span>}
            <div className="spacer" />
            <button
              className="filter-btn"
              type="button"
              onClick={() => {
                setSlips([]);
                setBanner(null);
              }}
            >
              Clear
            </button>
            <button className="btn-primary" type="button" onClick={saveAll} disabled={savingAll || readyCount === 0}>
              {savingAll ? "Saving…" : `Save ${readyCount || ""} to Notion`.trim()}
            </button>
          </div>

          <div>
            {slips.map((slip) => (
              <SlipRow
                key={slip.id}
                slip={slip}
                companies={companies}
                accounts={accounts}
                onField={(changes) => patchFields(slip.id, changes)}
                onToggle={() => patch(slip.id, { expanded: !slip.expanded })}
                onRetry={() => scan(slip)}
                onRemove={() => setSlips((prev) => prev.filter((s) => s.id !== slip.id))}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SlipRow({
  slip,
  companies,
  accounts,
  onField,
  onToggle,
  onRetry,
  onRemove,
}: {
  slip: Slip;
  companies: Company[];
  accounts: Account[];
  onField: (changes: Partial<SlipFields>) => void;
  onToggle: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const meta = STATUS_META[slip.status];
  const locked = slip.status === "saved" || slip.status === "saving";
  const lowConfidence = slip.confidence === "low";

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12.5,
    background: locked ? "var(--rail)" : "var(--surface-raised)",
    color: "var(--ink)",
    fontFamily: "inherit",
    width: "100%",
    minWidth: 0,
  };

  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "13px 16px" }}>
      <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
        {/* Thumbnail — the whole point of a review step is seeing the slip
            beside the numbers that were read off it. */}
        <a
          href={slip.previewUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            width: 56, height: 70, borderRadius: 8, overflow: "hidden", flexShrink: 0,
            border: "1px solid var(--border)", background: "var(--rail)", display: "block",
          }}
          title="Open full size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slip.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </a>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
            <span className={meta.cls}>{meta.label}</span>
            {slip.documentType && <span className="type-pill">{slip.documentType}</span>}
            {lowConfidence && slip.status === "ready" && (
              <span className="prio medium" title="The model wasn't sure — check the amount and date carefully">
                Low confidence — verify
              </span>
            )}
            {slip.reference && <span className="cell-muted" style={{ fontSize: 11 }}>Ref {slip.reference}</span>}
            <div style={{ flex: 1 }} />
            {slip.status === "error" && (
              <button className="link-btn" type="button" onClick={onRetry}>Retry</button>
            )}
            {(slip.lineItems?.length || slip.taxAmount !== undefined) && (
              <button className="link-btn" type="button" onClick={onToggle}>
                {slip.expanded ? "Hide detail" : "Detail"}
              </button>
            )}
            <button className="link-btn" type="button" onClick={onRemove} style={{ color: "var(--ink-muted)" }}>
              Remove
            </button>
          </div>

          {slip.status === "error" ? (
            <div style={{ fontSize: 12.5, color: "#a12424", lineHeight: 1.6 }}>
              {slip.error}
              <div style={{ color: "var(--ink-muted)", marginTop: 3 }}>
                You can still type the details in by hand and save with the rest.
              </div>
            </div>
          ) : slip.status === "scanning" || slip.status === "queued" ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              {slip.status === "queued" ? "Waiting for a slot…" : "Reading the slip…"}
            </div>
          ) : null}

          {(slip.status === "ready" || slip.status === "saved" || slip.status === "saving" || slip.status === "error") && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8 }}>
                <label style={{ gridColumn: "span 2", minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Description
                  </span>
                  <input style={inputStyle} value={slip.fields.name} disabled={locked} onChange={(e) => onField({ name: e.target.value })} />
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Amount
                  </span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <select
                      style={{ ...inputStyle, width: 68, flexShrink: 0 }}
                      value={slip.fields.currency}
                      disabled={locked}
                      onChange={(e) => onField({ currency: e.target.value })}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                      style={{ ...inputStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                      inputMode="decimal"
                      value={slip.fields.amount}
                      disabled={locked}
                      onChange={(e) => onField({ amount: e.target.value })}
                    />
                  </div>
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Date
                  </span>
                  <input type="date" style={inputStyle} value={slip.fields.date} disabled={locked} onChange={(e) => onField({ date: e.target.value })} />
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Category
                  </span>
                  <select style={inputStyle} value={slip.fields.category} disabled={locked} onChange={(e) => onField({ category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Company
                  </span>
                  <select style={inputStyle} value={slip.fields.companyId} disabled={locked} onChange={(e) => onField({ companyId: e.target.value })}>
                    <option value="">—</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                    Account
                  </span>
                  <select style={inputStyle} value={slip.fields.accountId} disabled={locked} onChange={(e) => onField({ accountId: e.target.value })}>
                    <option value="">—</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>

              {slip.expanded && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--rail)", borderRadius: 9, border: "1px solid var(--border)" }}>
                  {slip.taxAmount !== undefined && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-secondary)", marginBottom: 6 }}>
                      Tax read from slip: <strong>{slip.taxAmount}</strong>
                      {slip.paymentMethod ? ` · paid by ${slip.paymentMethod}` : ""}
                    </div>
                  )}
                  {slip.lineItems && slip.lineItems.length > 0 && (
                    <table className="dt" style={{ minWidth: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "5px 0" }}>Line item</th>
                          <th style={{ padding: "5px 0", width: 60 }}>Qty</th>
                          <th style={{ padding: "5px 0", width: 90 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slip.lineItems.map((li, i) => (
                          <tr key={i}>
                            <td style={{ padding: "5px 0" }}>{li.description || "—"}</td>
                            <td style={{ padding: "5px 0" }}>{li.quantity ?? "—"}</td>
                            <td style={{ padding: "5px 0", fontVariantNumeric: "tabular-nums" }}>{li.amount ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--ink-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Line items are shown for checking only — the single total above is what gets saved.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
