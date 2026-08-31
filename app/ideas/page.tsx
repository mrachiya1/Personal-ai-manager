import { getIdeas, getCompanies, getProjects, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import IdeaCapture from "@/components/IdeaCapture";

const priorityBadge: Record<string, string> = { Now: "badge high", Later: "badge med", Someday: "badge pending" };

export default async function IdeasPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Growth · Ideas Inbox</div>
          <h1 className="brand-serif">Ideas Inbox</h1>
        </div>
      </div>

      {!(await notionConnected()) ? (
        <ConnectPrompt />
      ) : (
        <>
          <div className="card section-card" style={{ marginBottom: 16 }}>
            <h2>Quick Capture</h2>
            <div className="section-sub">Writes straight to your Notion Ideas Inbox database</div>
            <IdeaCapture />
          </div>
          <IdeasBody />
        </>
      )}
      <div className="footnote">Orex OS — Ideas Inbox · live data from Notion</div>
    </>
  );
}

async function IdeasBody() {
  const [ideas, companies, projects] = await Promise.all([getIdeas(), getCompanies(), getProjects()]);
  const companyById = (id?: string) => companies.find((c) => c.id === id);
  const projectById = (id?: string) => projects.find((p) => p.id === id);

  const groups: Record<string, typeof ideas> = { Now: [], Later: [], Someday: [] };
  for (const idea of ideas) groups[idea.priority]?.push(idea);

  return (
    <section className="grid-3">
      {(["Now", "Later", "Someday"] as const).map((priority) => (
        <div className="card section-card" key={priority}>
          <h2>{priority}</h2>
          <div className="section-sub">{groups[priority].length} idea(s)</div>
          {groups[priority].length === 0 && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Nothing here.</div>}
          {groups[priority].map((idea) => (
            <div key={idea.id} className="plan-item" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="plan-text" style={{ flex: 1 }}>
                <div className="title">{idea.idea}</div>
                {idea.description && <div className="reason">{idea.description}</div>}
                <div className="reason" style={{ marginTop: 4 }}>
                  {companyById(idea.linkedCompanyId)?.name || projectById(idea.linkedProjectId)?.name || "Unassigned"}
                </div>
              </div>
              <span className={priorityBadge[idea.priority]}>{idea.priority}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
