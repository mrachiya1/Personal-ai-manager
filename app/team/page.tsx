import Link from "next/link";
import { getTeamMembers, getCompanies, getProjects, getTasks, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewTeamMemberButton, EditTeamMemberButton } from "@/components/TeamForm";
import TeamSettings from "@/components/TeamSettings";
import { AUTH_ENABLED } from "@/auth";

const statusBadge: Record<string, string> = { Active: "badge paid", Inactive: "badge pending" };

export default async function TeamPage() {
  const connected = await notionConnected();
  const [companies, projects, tasks] = connected
    ? await Promise.all([getCompanies(), getProjects(), getTasks()])
    : [[], [], []];

  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));
  const projectOpts = projects.map((p) => ({ id: p.id, name: p.name, parentId: p.companyId }));
  const taskOpts = tasks.map((t) => ({ id: t.id, name: t.title, parentId: t.projectId }));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Team</div>
          <h1 className="brand-serif">Team</h1>
        </div>
        {connected && (
          <div className="topbar-actions">
            <NewTeamMemberButton companies={companies} />
          </div>
        )}
      </div>
      {!connected ? <ConnectPrompt /> : <TeamBody companies={companies} />}

      {/* ── App access: invite team members & grant company/project access ── */}
      <TeamSettings
        companies={companyOpts}
        projects={projectOpts}
        tasks={taskOpts}
        authEnabled={AUTH_ENABLED}
      />

      <div className="footnote">Orex OS — Team · live data from Notion</div>
    </>
  );
}

async function TeamBody({ companies }: { companies: Awaited<ReturnType<typeof getCompanies>> }) {
  const team = await getTeamMembers();
  const companyById = (id?: string) => companies.find((c) => c.id === id);

  return (
    <div className="card section-card">
      <h2>Team Members</h2>
      <div className="section-sub">{team.length} across all companies</div>
      <table className="mini">
        <tbody>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Company</th>
            <th>Contact</th>
            <th>Status</th>
            <th></th>
          </tr>
          {team.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: "var(--ink-muted)" }}>No team members yet — click &ldquo;Add Team Member&rdquo; above.</td>
            </tr>
          )}
          {team.map((m) => (
            <tr key={m.id}>
              <td>
                <div className="proj-name">{m.name}</div>
                {m.notes && <div className="proj-client">{m.notes}</div>}
              </td>
              <td>{m.role || "—"}</td>
              <td>
                {companyById(m.companyId) ? (
                  <Link href={`/companies/${m.companyId}`} className="link-btn">
                    {companyById(m.companyId)?.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {m.email && <div>{m.email}</div>}
                {m.phone && <div style={{ color: "var(--ink-muted)", fontSize: 11.5 }}>{m.phone}</div>}
                {!m.email && !m.phone && "—"}
              </td>
              <td><span className={statusBadge[m.status] ?? "badge pending"}>{m.status}</span></td>
              <td><EditTeamMemberButton member={m} companies={companies} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
