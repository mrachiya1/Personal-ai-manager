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
import ProjectsWorkspace from "@/components/ProjectsWorkspace";
import { localDateISO } from "@/lib/timezone";
import { REQUIRED_PROJECT_PROPS } from "@/lib/projectSchema";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const connected = await notionConnected();

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Companies · Projects</div>
          <h1 className="brand-serif">Projects</h1>
        </div>
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

  // A project with no Client relation but a payment pointing at it still
  // belongs to that client — filling it in here means the client column is
  // populated on day one rather than staying empty until the schema
  // migration runs, and it keeps such projects out of the personal section
  // where they would badly misreport the split.
  const withClient = projects.map((p) => {
    if (p.clientId) return p;
    const viaPayment = payments.find((pay) => pay.projectId === p.id && pay.clientId)?.clientId;
    return viaPayment ? { ...p, clientId: viaPayment } : p;
  });

  // If no project carries any of the added fields, the migration hasn't run —
  // worth saying plainly rather than showing columns that can never fill.
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

  const currency = payments.find((pay) => pay.currency)?.currency || "USD";

  return (
    <ProjectsWorkspace
      projects={withClient}
      companies={companies}
      clients={clients}
      team={team}
      tasks={tasks}
      payments={payments}
      todayISO={localDateISO()}
      schemaReady={schemaReady}
      currency={currency}
    />
  );
}

export const metadata = {
  title: "Projects · Orex OS",
  description: `Projects with ${REQUIRED_PROJECT_PROPS.length} tracked fields, urgent work first.`,
};
