"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The two taps, plus the one question worth asking straight after the second.
 *
 * Waking up is the moment the working day's shape is actually known, and it
 * is the only moment the operator is guaranteed to be in the app before work
 * starts. Asking here — once, with a proposed answer already filled in —
 * costs a tap; asking on the Today page costs a trip to it, which is the trip
 * that doesn't happen on the mornings it matters most.
 *
 * The suggestion is a proposal, never a write. Nothing is saved until Set is
 * pressed, because a tool that silently decides when you start work is worse
 * than one that doesn't ask.
 */
export default function SleepButtons({ hasOpenLog }: { hasOpenLog: boolean }) {
  const [loading, setLoading] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ start: string; end: string; wokeAt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const router = useRouter();

  async function tap(action: "start" | "end") {
    setLoading(action);
    setError(null);
    setSaved(null);
    const wokeAt = new Date().toISOString();
    try {
      const res = await fetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      if (action === "end") {
        // Ask the workday route what it would propose, given this wake time
        // and the usual day's length. A failure here is silent: the sleep log
        // saved, which is what the button promised, and the hours can still be
        // set on Today.
        try {
          const s = await fetch(`/api/workday?fromWake=${encodeURIComponent(wokeAt)}`, { cache: "no-store" });
          const sd = await s.json();
          if (s.ok && sd?.suggestion) setOffer({ ...sd.suggestion, wokeAt });
        } catch {
          /* no suggestion, no harm */
        }
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function setHours() {
    if (!offer) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: offer.start, end: offer.end, fromWake: offer.wokeAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't set your hours");
      setSaved(`Working ${data.window.start}–${data.window.end} today. Today's plan is built around it.`);
      setOffer(null);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          className="sleep-btn to-sleep"
          onClick={() => tap("start")}
          disabled={loading !== null || hasOpenLog}
        >
          😴 {loading === "start" ? "Logging…" : "Went to sleep"}
        </button>
        <button
          className="sleep-btn to-wake"
          onClick={() => tap("end")}
          disabled={loading !== null || !hasOpenLog}
        >
          ☀️ {loading === "end" ? "Logging…" : "Woke up"}
        </button>
      </div>

      {offer && (
        <div className="wake-offer">
          <div className="wo-head">Set today&apos;s working hours?</div>
          <p className="wo-body">
            You&apos;re up — start at <strong>{offer.start}</strong> and finish at <strong>{offer.end}</strong>? That
            keeps your usual day&apos;s length from when you actually got up. Today&apos;s plan and your calendar are
            built inside these hours.
          </p>
          <div className="wo-times">
            <label>
              Start
              <input
                type="time"
                className="ww-time"
                value={offer.start}
                onChange={(e) => setOffer({ ...offer, start: e.target.value })}
                aria-label="Work start time"
              />
            </label>
            <label>
              End
              <input
                type="time"
                className="ww-time"
                value={offer.end}
                onChange={(e) => setOffer({ ...offer, end: e.target.value })}
                aria-label="Work end time"
              />
            </label>
          </div>
          <div className="wo-actions">
            <button className="btn-save" type="button" onClick={setHours} disabled={saving}>
              {saving ? "Setting…" : "Set my hours"}
            </button>
            <button className="btn-discard" type="button" onClick={() => setOffer(null)} disabled={saving}>
              Not now
            </button>
          </div>
        </div>
      )}

      {saved && <div className="wo-saved">{saved}</div>}
      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
      {hasOpenLog && !offer && (
        <div style={{ color: "var(--ink-muted)", fontSize: 12.5, marginTop: 10 }}>
          You&apos;re currently logged as asleep — tap &quot;Woke up&quot; when you get up.
        </div>
      )}
    </div>
  );
}
