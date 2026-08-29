import {
  getProjects,
  getCompanies,
  getTasks,
  getClients,
  getTeamMembers,
  getPayments,
  notionConnected,
  ensureProjectSchema,
  ensureTaskSchema,
} from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import ProjectsWorkspace from "@/components/ProjectsWorkspace";
import { localDateISO } from "@/lib/timezone";
import { REQUIRED_PROJECT_PROPS } from "@/lib/projectSchema";
import { getThumbnails } from "@/lib/thumbnails";

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
  // The schema sync runs first and on every render: it adds any missing
  // property before the data is read, so a freshly-mapped database fills its
  // columns on the first visit rather than showing a banner about work the
  // owner then has to go and do by hand.
  // Both schemas, before anything is read: the Tasks one adds "Parent Task",
  // and without that relation every task is a root and the tree the rest of
  // this screen is built around silently degrades to a flat list.
  const [schema, taskSchema] = await Promise.all([ensureProjectSchema(), ensureTaskSchema()]);

  const [projects, tasks, companies, clients, team, payments, thumbs] = await Promise.all([
    getProjects(),
    getTasks(),
    getCompanies(),
    getClients(),
    getTeamMembers(),
    getPayments(),
    getThumbnails(),
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

  const currency = payments.find((pay) => pay.currency)?.currency || "USD";

  return (
    <ProjectsWorkspace
      projects={withClient}
      companies={companies}
      clients={clients}
      team={team}
      tasks={tasks}
      thumbs={Object.fromEntries(Object.entries(thumbs).map(([id, t]) => [id, t.thumb]))}
      taskSchema={taskSchema}
      payments={payments}
      todayISO={localDateISO()}
      schema={schema}
      currency={currency}
    />
  );
}

export const metadata = {
  title: "Projects · Orex OS",
  description: `Projects with ${REQUIRED_PROJECT_PROPS.length} tracked fields, urgent work first.`,
};
