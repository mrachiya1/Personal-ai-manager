import { fetchCurrentTransits, isAstroConnected } from "@/lib/astro";
import { getPanchangWindows } from "@/lib/panchang";
import { getAstroEvents, notionConnected } from "@/lib/notion";
import { dateFeatures, lifePathNumber, personalDayNumber, personalYearNumber } from "@/lib/numerology";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewAstroEventButton } from "@/components/AstroEventForm";
import { localDateISO } from "@/lib/timezone";
import { setting } from "@/lib/settings";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default async function AstroLabPage() {
  const todayISO = localDateISO();
  const features = dateFeatures(todayISO);
  const birthDate = setting("birthDate", "BIRTH_DATE");
  const astroConnected = isAstroConnected();

  const [transits, panchang] = await Promise.all([
    fetchCurrentTransits({ date: todayISO }),
    getPanchangWindows(todayISO),
  ]);
  const history = (await notionConnected()) ? await getAstroEvents(10) : [];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self · Astrology &amp; Numerology</div>
          <h1 className="brand-serif">Astro Lab</h1>
        </div>
      </div>

      <section className="grid-2">
        <div className="card section-card">
          <h2>Numerology — Today</h2>
          <div className="section-sub">Computed locally, no API needed</div>
          {!birthDate ? (
            <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>
              Set BIRTH_DATE (YYYY-MM-DD) in .env.local to unlock this.
            </div>
          ) : (
            <div className="stat-mini-grid">
              <div className="stat-mini">
                <div className="stat-label">Life Path</div>
                <div className="stat-value">{lifePathNumber(birthDate)}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Personal Year</div>
                <div className="stat-value">{personalYearNumber(birthDate, features.year)}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Personal Day</div>
                <div className="stat-value">{personalDayNumber(birthDate, todayISO)}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-label">Weekday</div>
                <div className="stat-value" style={{ fontSize: 14 }}>{features.weekdayName}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card section-card">
          <h2>Current Transits</h2>
          <div className="section-sub">
            {astroConnected ? `Live from ${transits?.provider ?? "your astrology API"}` : "Astrology API not connected"}
          </div>
          {!astroConnected && (
            <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>
              Add your Prokerala or AstrologyAPI.com credentials on the Settings page (or set
              PROKERALA_CLIENT_ID + PROKERALA_CLIENT_SECRET / ASTROLOGY_API_USER_ID + ASTROLOGY_API_KEY in .env.local).
            </div>
          )}
          {astroConnected && !transits && (
            <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>
              Couldn&rsquo;t reach either configured astrology API — check the credentials, or the response
              shape may need a tweak in lib/astro.ts.
            </div>
          )}
          {transits && transits.keyTransits.length > 0 && (
            <div className="chip-row">
              {transits.keyTransits.map((t, i) => (
                <span className="chip" key={i}>
                  <span className="dot" style={{ background: "var(--violet)" }} />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card section-card" style={{ marginTop: 16 }}>
        <h2>Rahu Kalam &middot; Yamagandam &middot; Gulika Kalam</h2>
        <div className="section-sub">
          {panchang
            ? `${panchang.weekdayName} · computed from sunrise ${fmtTime(panchang.sunrise)} / sunset ${fmtTime(panchang.sunset)} at your saved coordinates — no API key needed`
            : "Couldn't reach the sunrise/sunset service — try again shortly"}
        </div>
        {panchang && (
          <div className="stat-mini-grid">
            <div className="stat-mini">
              <div className="stat-label">Rahu Kalam</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {fmtTime(panchang.rahuKalam.start)}–{fmtTime(panchang.rahuKalam.end)}
              </div>
            </div>
            <div className="stat-mini">
              <div className="stat-label">Yamagandam</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {fmtTime(panchang.yamagandam.start)}–{fmtTime(panchang.yamagandam.end)}
              </div>
            </div>
            <div className="stat-mini">
              <div className="stat-label">Gulika Kalam</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {fmtTime(panchang.gulikaKalam.start)}–{fmtTime(panchang.gulikaKalam.end)}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card section-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Astro Event History</h2>
            <div className="section-sub">From your Notion Astro Events database</div>
          </div>
          {(await notionConnected()) && <NewAstroEventButton />}
        </div>
        {!(await notionConnected()) ? (
          <ConnectPrompt />
        ) : (
          <table className="mini">
            <tbody>
              <tr>
                <th>Date</th>
                <th>Key Transits</th>
                <th>Interpretation</th>
              </tr>
              {history.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--ink-muted)" }}>No entries yet.</td>
                </tr>
              )}
              {history.map((e) => (
                <tr key={e.id}>
                  <td>{e.eventDate}</td>
                  <td>{e.keyTransits || "—"}</td>
                  <td>{e.aiInterpretation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="footnote">Orex OS — Astro Lab</div>
    </>
  );
}
