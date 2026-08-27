import type { DayEnergy } from "@/lib/dayEnergy";
import { formatLocalTime } from "@/lib/timezone";

/**
 * The daily read, written as a peer would say it.
 *
 * Every clause is bound to a computed input — the Moon's rasi, the hora
 * running now, the personal day number, the windows the panchang blocks out.
 * Nothing here is decorative: if a line can't be traced to a number, it
 * doesn't get printed.
 */
export default function ExecutiveSummary({
  energy,
  name,
  org,
  triggered,
}: {
  energy: DayEnergy;
  /** Empty in single-user local mode, where nobody has signed in. */
  name: string;
  /** Derived from the workspace, never hardcoded — this page is served to
   *  whoever signs in, and their company is not yours. */
  org: string;
  triggered: { id: string; rule: string; guidance: string }[];
}) {
  const tone = energy.score >= 70 ? "strong" : energy.score >= 50 ? "steady" : "thin";

  return (
    <section className={`card exec-card ${tone}`}>
      <div className="exec-main">
        <div className="exec-top">
          <span className="exec-verdict">{energy.verdict}</span>
          <span className="exec-score" title="Weighted from the day's horas, Moon phase and personal day number">
            {energy.score}
            <i>/100</i>
          </span>
        </div>

        <p className="exec-lead">
          {name ? `Hello ${name}, ${org}.` : `Hello, ${org}.`} {energy.headline}
        </p>

        <ul className="exec-reasons">
          {energy.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>

        {triggered.length > 0 && (
          <div className="exec-rules">
            <span className="exec-rules-label">Your rules fired</span>
            {triggered.map((r) => (
              <span className="chip" key={r.id}>
                <span className="dot" style={{ background: "var(--violet)" }} />
                {r.rule}
              </span>
            ))}
            <p className="exec-rules-body">{triggered.map((r) => r.guidance).join(" ")}</p>
          </div>
        )}
      </div>

      <div className="exec-blocks">
        {energy.deepWork && (
          <div className="exec-block deep">
            <span className="eb-tag">Deep work block</span>
            <div className="eb-time">
              {formatLocalTime(energy.deepWork.start)} – {formatLocalTime(energy.deepWork.end)}
            </div>
            <div className="eb-label">{energy.deepWork.label}</div>
            <p className="eb-why">{energy.deepWork.reason}</p>
          </div>
        )}
        {energy.rest && (
          <div className="exec-block rest">
            <span className="eb-tag">Reset &amp; recharge</span>
            <div className="eb-time">
              {formatLocalTime(energy.rest.start)} – {formatLocalTime(energy.rest.end)}
            </div>
            <div className="eb-label">{energy.rest.label}</div>
            <p className="eb-why">{energy.rest.reason}</p>
          </div>
        )}
        {!energy.deepWork && !energy.rest && (
          <div className="exec-block">
            <span className="eb-tag">Windows unavailable</span>
            <p className="eb-why">
              Sunrise data didn&rsquo;t load, so today&rsquo;s horas couldn&rsquo;t be calculated. Set your coordinates in
              Settings → Personal if this keeps happening.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
