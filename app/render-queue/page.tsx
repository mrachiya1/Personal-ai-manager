import Link from "next/link";
import { getProjects, getCompanies, getClients, getTeamMembers, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewProjectButton, EditProjectButton } from "@/components/ProjectForm";

const priorityBadgeClass: Record<string, string> = { High: "badge high", Medium: "badge med", Low: "badge low" };

export default async function RenderQueuePage() {
  const connected = await notionConnected();
  const [companies, clients, team] = connected
    ? await Promise.all([getCompanies(), getClients(), getTeamMembers()])
    : [[], [], []];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · 3D / Motion</div>
          <h1 className="brand-serif">Render Queue</h1>
        </div>
        {connected && (
          <div className="topbar-actions">
            <NewProjectButton companies={companies} clients={clients} team={team} defaultStatus="Rendering-Ready" label="Schedule Render" />
          </div>
        )}
      </div>
      {!connected ? <ConnectPrompt /> : <RenderQueueBody companies={companies} clients={clients} team={team} />}
      <div className="footnote">Orex OS — Render Queue · live data from Notion (Projects, Status = Rendering-Ready)</div>
    </>
  );
}

async function RenderQueueBody({
  companies,
  clients,
  team,
}: {
  companies: Awaited<ReturnType<typeof getCompanies>>;
  clients: Awaited<ReturnType<typeof getClients>>;
  team: Awaited<ReturnType<typeof getTeamMembers>>;
}) {
  const projects = await getProjects();
  const companyById = (id: string) => companies.find((c) => c.id === id);
  const queue = projects
    .filter((p) => p.status === "Rendering-Ready")
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 } as const;
      const pa = order[a.renderPriority ?? "Low"];
      const pb = order[b.renderPriority ?? "Low"];
      if (pa !== pb) return pa - pb;
      return (a.deadline ?? "").localeCompare(b.deadline ?? "");
    });
  const totalHours = queue.reduce((s, p) => s + (p.estimatedRenderHours || 0), 0);

  return (
    <div className="card section-card">
      <h2>Rendering-Ready Projects</h2>
      <div className="section-sub">
        {queue.length} project(s) ready to render, sorted by priority then deadline
        {totalHours > 0 ? ` · ~${totalHours}h of render time queued` : ""}
      </div>
      <table className="mini">
        <tbody>
          <tr>
            <th>Project</th>
            <th>Company</th>
            <th>Priority</th>
            <th>Est. Render Time</th>
            <th>Deadline</th>
            <th></th>
          </tr>
          {queue.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: "var(--ink-muted)" }}>
                Nothing rendering-ready right now — click &ldquo;Schedule Render&rdquo; above once a project is ready to queue.
              </td>
            </tr>
          )}
          {queue.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="proj-name">{p.name}</div>
              </td>
              <td>
                {companyById(p.companyId) ? (
                  <Link href={`/companies/${p.companyId}`} className="link-btn">
                    {companyById(p.companyId)?.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <span className={priorityBadgeClass[p.renderPriority ?? "Low"]}>{p.renderPriority ?? "—"}</span>
              </td>
              <td>{p.estimatedRenderHours ? `${p.estimatedRenderHours}h` : "—"}</td>
              <td>{p.deadline ?? "—"}</td>
              <td><EditProjectButton project={p} companies={companies} clients={clients} team={team} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
