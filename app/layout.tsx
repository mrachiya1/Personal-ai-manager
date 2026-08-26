import type { Metadata } from "next";
import "./globals.css";
import Sidebar, { type SidebarWorkspace } from "@/components/Sidebar";
import ChatWidget from "@/components/ChatWidget";
import { getCompanies, notionConnected, unmappedDatabases } from "@/lib/notion";
import SetupBanner from "@/components/SetupBanner";
import { DB_KEYS } from "@/lib/userConfig";
import { AUTH_ENABLED, currentUser } from "@/auth";

/**
 * Nothing in this app may be prerendered at build time.
 *
 * Every page reads the signed-in user's own Notion workspace, so a static
 * render would freeze whatever data existed when the build ran — which on a
 * fresh deploy is nothing at all — and serve that same empty HTML to every
 * user forever. Next statically renders any page that doesn't opt out, and
 * twelve of them were silently doing exactly that.
 *
 * Declared once on the root layout so it applies to the whole tree and a new
 * page can't quietly reintroduce the problem.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orex OS",
  description: "Personal Life & Company Intelligence — daily plan, clients, projects, and more.",
};

// Runs before paint so switching pages (or a hard refresh) never flashes the
// light theme before snapping to a saved dark preference.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('orex-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
`;

/**
 * The company rail in the sidebar. Wrapped in its own try/catch because a
 * broken Notion connection must degrade to "no companies listed", never to a
 * 500 on every single page of the app.
 */
async function loadWorkspaces(): Promise<SidebarWorkspace[]> {
  try {
    if (!(await notionConnected())) return [];
    const companies = await getCompanies();
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      colorVar: c.colorVar,
      href: `/companies/${c.id}`,
    }));
  } catch {
    return [];
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();

  // When logins are on and nobody is signed in, the only page that renders is
  // /login (middleware sends everything else there) — so it gets the bare
  // canvas rather than an app shell wrapped around a sign-in card.
  const showShell = !AUTH_ENABLED || Boolean(user);
  const workspaces = showShell ? await loadWorkspaces() : [];

  // A connected token with no databases mapped renders every tab empty. Say so
  // once, at the top of the app, rather than letting it look broken.
  let unmapped: string[] = [];
  if (showShell) {
    try {
      if (await notionConnected()) unmapped = await unmappedDatabases();
    } catch {
      unmapped = [];
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {showShell ? (
          <>
            <div className="app-shell">
              <div className="app-frame">
                <Sidebar
                  workspaces={workspaces}
                  user={user}
                  authEnabled={AUTH_ENABLED}
                  workspaceLabel="Orex OS"
                  orgLabel={user?.email || user?.name || "Personal workspace"}
                />
                <main className="main">
                  <SetupBanner unmappedCount={unmapped.length} total={DB_KEYS.length} />
                  {children}
                </main>
              </div>
            </div>
            <ChatWidget />
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
