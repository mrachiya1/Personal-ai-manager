import { getCoreRules, getCompanies, notionConnected } from "@/lib/notion";
import { buildRuleVars, evaluateRules } from "@/lib/rulesEngine";
import { setting } from "@/lib/settings";
import ConnectPrompt from "@/components/ConnectPrompt";

const categoryColor: Record<string, string> = {
  Numerology: "--blue",
  Astro: "--violet",
  "Personal Pattern": "--aqua",
  "Company-specific": "--orange",
};

export default async function RulesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self · Core Rules</div>
          <h1 className="brand-serif">Rules</h1>
        </div>
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <RulesBody />}
      <div className="footnote">
        Orex OS — Rules · live data from Notion. Add or edit rules there; conditions use day_of_month, month, year,
        weekday, and personal_day_number.
      </div>
    </>
  );
}

async function RulesBody() {
  const [rules, companies] = await Promise.all([getCoreRules(), getCompanies()]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const vars = buildRuleVars(todayISO, setting("birthDate", "BIRTH_DATE"));
  const evaluated = evaluateRules(rules, vars);
  const companyById = (id?: string) => companies.find((c) => c.id === id);

  return (
    <div className="card section-card">
      <h2>Active Rules</h2>
      <div className="section-sub">{evaluated.length} rule(s) — highlighted ones are triggered today</div>
      <table className="mini">
        <tbody>
          <tr>
            <th>Rule</th>
            <th>Category</th>
            <th>Condition</th>
            <th>Applies To</th>
            <th>Today</th>
          </tr>
          {evaluated.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--ink-muted)" }}>No active rules — add one in Notion.</td>
            </tr>
          )}
          {evaluated.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="proj-name">{r.rule}</div>
                <div className="proj-client">{r.guidance}</div>
              </td>
              <td>
                <span className="chip" style={{ padding: "3px 9px" }}>
                  <span className="dot" style={{ background: `var(${categoryColor[r.category] ?? "--blue"})` }} />
                  {r.category}
                </span>
              </td>
              <td>
                <code style={{ fontSize: 12 }}>{r.condition}</code>
              </td>
              <td>{companyById(r.appliesToCompanyId)?.name ?? "All"}</td>
              <td>
                <span className={r.triggered ? "badge high" : "badge pending"}>{r.triggered ? "Triggered" : "—"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
