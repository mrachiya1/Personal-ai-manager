import type { DayEnergy } from "@/lib/dayEnergy";
import { formatLocalTime } from "@/lib/timezone";

/**
 * The day's read, in three parts: what kind of day it is, why, and what that
 * adds up to.
 *
 * Every clause is bound to a computed input — the Moon's rasi, the hora
 * running now, the personal day number, the windows the panchang blocks out.
 * If a line can't be traced to a number it doesn't get printed.
 */
export default function SynthesisCard({
  energy,
  personalDay,
  oddCalendarDay,
  triggered,
}: {
  energy: DayEnergy;
  personalDay: number | null;
  oddCalendarDay: boolean;
  triggered: { id: string; rule: string; guidance: string }[];
}) {
  const tone = energy.score >= 70 ? "good" : energy.score >= 50 ? "steady" : "thin";
  const pill = energy.score >= 70 ? "GOOD DAY" : energy.score >= 50 ? "STEADY DAY" : "PROTECT THE DAY";

  return (
    <section className={`card synth ${tone}`}>
      {/* --- left: the verdict ------------------------------------------ */}
      <div className="synth-vibe">
        <span className="synth-pill">
          <span className="dot" />
          {pill}
        </span>
        <h2 className="synth-headline">
          {energy.deepWork ? "Favorable for deep work" : energy.verdict}
        </h2>
        <div className="synth-meta">
          {personalDay !== null ? `Personal Day ${personalDay} · ` : ""}
          {oddCalendarDay ? "Odd" : "Even"} calendar day
        </div>
        {energy.deepWork && (
          <div className="synth-window">
            <span className="sw-tag">Deep work window</span>
            <span className="sw-time">
              {formatLocalTime(energy.deepWork.start)} – {formatLocalTime(energy.deepWork.end)}
            </span>
            <span className="sw-label">{energy.deepWork.label}</span>
          </div>
        )}

        <div className="synth-score">
          <span className="ss-num">{energy.score}</span>
          <span className="ss-of">/100 day weighting</span>
        </div>
      </div>

      {/* --- middle: why ------------------------------------------------- */}
      <div className="synth-reasoning">
        <div className="synth-label">Today&rsquo;s reasoning</div>
        {triggered.length > 0 && (
          <div className="synth-tags">
            {triggered.map((r) => (
              <span className="synth-tag" key={r.id}>
                <span className="dot" />
                {r.rule}
              </span>
            ))}
          </div>
        )}
        {triggered.length > 0 && <p className="synth-body">{triggered.map((r) => r.guidance).join(" ")}</p>}
        <ul className="synth-list">
          {energy.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>

      {/* --- right: what it adds up to ----------------------------------- */}
      <aside className="synth-overall">
        <div className="synth-label">Overall about the day</div>
        <p className="synth-overall-lead">{energy.headline}</p>
        <dl className="synth-facts">
          <div>
            <dt>Moon</dt>
            <dd>
              {energy.moon.rasi} · {energy.moon.nakshatra}
            </dd>
          </div>
          <div>
            <dt>Tithi</dt>
            <dd>
              {energy.moon.tithi.paksha} {energy.moon.tithi.name}
              {energy.moon.isPurnima ? " · Poya" : ""}
            </dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>
              {energy.moon.phaseName} · {Math.round(energy.moon.illumination * 100)}% lit
            </dd>
          </div>
          <div>
            <dt>Hora now</dt>
            <dd>{energy.currentHora ? energy.currentHora.planet : "—"}</dd>
          </div>
          <div>
            <dt>Tilts toward</dt>
            <dd>{energy.moon.favors}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
