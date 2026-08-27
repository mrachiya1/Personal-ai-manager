import type { PanchangWindows } from "@/lib/panchang";
import { formatLocalTime } from "@/lib/timezone";

/**
 * The three inauspicious windows, on one line.
 *
 * Named rather than colour-coded: "avoid" on its own tells you nothing about
 * what to do instead, and the whole point of knowing these is that the hours
 * are still usable — for study, documentation and asset work, just not for
 * anything with someone else's signature on it.
 */
export default function TransitStrip({
  panchang,
  activeName,
}: {
  panchang: PanchangWindows | null;
  activeName?: string;
}) {
  if (!panchang) {
    return (
      <section className="transit-strip empty">
        Sunrise data unavailable — set your coordinates in Settings → Personal to get today&rsquo;s windows.
      </section>
    );
  }

  const windows: [string, { start: string; end: string }, string][] = [
    ["Rahu Kalam", panchang.rahuKalam, "No launches, sign-offs, cold outreach or live deploys"],
    ["Yamagandam", panchang.yamagandam, "Weak for new starts — route study and asset work here"],
    ["Gulika Kalam", panchang.gulikaKalam, "Poor for anything you want to last — good for repeat work"],
  ];

  return (
    <section className="transit-strip">
      {windows.map(([name, w, why]) => {
        const active = activeName === name;
        return (
          <span className={`ts-item${active ? " on" : ""}`} key={name} title={why}>
            <span className="ts-name">{name}</span>
            <span className="ts-time">
              {formatLocalTime(w.start)}–{formatLocalTime(w.end)}
            </span>
            <span className="ts-why">{active ? `Running now — ${why.toLowerCase()}` : why}</span>
          </span>
        );
      })}
    </section>
  );
}
