import Link from "next/link";
import { getTeamMembers, getCompanies, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewTeamMemberButton, EditTeamMemberButton } from "@/components/TeamForm";

const statusBadge: Record<string, string> = { Active: "badge paid", Inactive: "badge pending" };

export default async function TeamPage() {
  const companies = (await notionConnected()) ? await getCompanies() : [];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Team</div>
          <h1 className="brand-serif">Team</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewTeamMemberButton companies={companies} />
          </div>
        )}
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <TeamBody companies={companies} />}
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
