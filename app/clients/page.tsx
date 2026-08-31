import { getClients, getCompanies, getProjects, getPayments, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import ClientsView from "@/components/ClientsView";
import { localDateISO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  if (!(await notionConnected())) {
    return (
      <>
        <div className="topbar">
          <div>
            <div className="eyebrow">Companies · Client Management</div>
            <h1 className="brand-serif">Clients</h1>
          </div>
        </div>
        <ConnectPrompt />
      </>
    );
  }

  const [clients, companies, projects, payments] = await Promise.all([
    getClients(),
    getCompanies(),
    getProjects(),
    getPayments(),
  ]);

  return (
    <ClientsView
      clients={clients}
      companies={companies}
      projects={projects}
      payments={payments}
      todayISO={localDateISO()}
    />
  );
}
