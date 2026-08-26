import {
  getProjects,
  getCompanies,
  getTasks,
  getClients,
  getTeamMembers,
  getPayments,
  notionConnected,
} from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewProjectButton } from "@/components/ProjectForm";
import ProjectsWorkspace from "@/components/ProjectsWorkspace";
import { localDateISO } from "@/lib/timezone";
import { REQUIRED_PROJECT_PROPS } from "@/lib/projectSchema";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const connected = await notionConnected();
  const companies = connected ? await getCompanies() : [];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Projects</div>
          <h1 className="brand-serif">Projects</h1>
        </div>
        {connected && (
          <div className="topbar-actions">
            <NewProjectButton companies={companies} />
          </div>
        )}
      </div>
      {!connected ? <ConnectPrompt /> : <ProjectsBody />}
      <div className="footnote">Orex OS — Projects · live data from Notion</div>
    </>
  );
}

async function ProjectsBody() {
  const [projects, tasks, companies, clients, team, payments] = await Promise.all([
    getProjects(),
    getTasks(),
    getCompanies(),
    getClients(),
    getTeamMembers(),
    getPayments(),
  ]);

  // Before the "Client" property exists on the Projects database, the only way
  // to know which client a project belongs to is the path through Payments.
  // Building it here means the client column is populated on day one rather
  // than staying empty until someone runs the schema migration.
  const clientByProjectFallback: Record<string, string> = {};
  for (const pay of payments) {
    if (pay.projectId && pay.clientId && !clientByProjectFallback[pay.projectId]) {
      clientByProjectFallback[pay.projectId] = pay.clientId;
    }
  }

  // If no project carries any of the added fields, the migration hasn't run —
  // which is worth saying plainly rather than showing columns that can never fill.
  // If no project carries any of the added fields, the migration hasn't run —
  // which is worth saying plainly rather than showing columns that can never fill.
  const schemaReady =
    projects.length === 0 ||
    projects.some(
      (p) =>
        p.assignedTo.length > 0 ||
        p.startDate !== undefined ||
        p.value !== undefined ||
        p.headline !== undefined ||
        p.clientRequests !== undefined ||
        p.lastReviewed !== undefined ||
        p.clientId !== undefined
    );

  return (
    <ProjectsWorkspace
      projects={projects}
      companies={companies}
      clients={clients}
      team={team}
      tasks={tasks}
      todayISO={localDateISO()}
      clientByProjectFallback={clientByProjectFallback}
      schemaReady={schemaReady}
    />
  );
}

export const metadata = {
  title: "Projects · Orex OS",
  description: `Projects with ${REQUIRED_PROJECT_PROPS.length} tracked fields, urgent work first.`,
};
