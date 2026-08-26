import { notionConnected } from "@/lib/notion";
import { isGoogleCalendarConnected } from "@/lib/googleCalendar";
import { setting } from "@/lib/settings";
import { store } from "@/lib/store";
import { encryptionAvailable, maskSecret, decryptSecret } from "@/lib/secrets";
import { DB_KEYS, DB_LABELS, getDbMap, getUserConfig } from "@/lib/userConfig";
import { AUTH_ENABLED, currentUser } from "@/auth";
import { oauthConfigured } from "@/app/api/notion/oauth/route";
import ThemeToggleRow from "@/components/ThemeToggleRow";
import { SettingsSection } from "@/components/SettingsForm";
import { AccountDataCard, DatabaseMappingCard, NotionConnectCard, ProjectFieldsCard } from "@/components/NotionSettings";
import { PreferencesCard, SettingsTabs } from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        padding: "10px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{label}</div>
      <span className={ok ? "badge low" : "badge pending"}>{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const [notionOk, cfg, dbMap, user] = await Promise.all([
    notionConnected(),
    getUserConfig(),
    getDbMap(),
    currentUser(),
  ]);

  const ownToken = decryptSecret(cfg.notionTokenEnc);
  const usingInstallKey = !ownToken && Boolean(process.env.NOTION_API_KEY);

  const ownOpenRouter = decryptSecret(cfg.openRouterApiKeyEnc);
  const installOpenRouter = setting("openRouterApiKey", "OPENROUTER_API_KEY");
  const openRouterConnected = Boolean(ownOpenRouter || installOpenRouter);

  const openrouterModel =
    cfg.openRouterModel || setting("openRouterModel", "OPENROUTER_MODEL") || "deepseek/deepseek-chat";
  const visionModel =
    cfg.openRouterVisionModel || setting("openRouterVisionModel", "OPENROUTER_VISION_MODEL") || "google/gemini-2.5-flash";

  const prokeralaConnected = Boolean(
    setting("prokeralaClientId", "PROKERALA_CLIENT_ID") && setting("prokeralaClientSecret", "PROKERALA_CLIENT_SECRET")
  );
  const astrologyApiConnected = Boolean(
    setting("astrologyApiUserId", "ASTROLOGY_API_USER_ID") && setting("astrologyApiKey", "ASTROLOGY_API_KEY")
  );
  const googleConnected = isGoogleCalendarConnected();

  const installValues = {
    googleServiceAccountEmail: setting("googleServiceAccountEmail", "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    googleServiceAccountPrivateKey: setting("googleServiceAccountPrivateKey", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    googleCalendarId: setting("googleCalendarId", "GOOGLE_CALENDAR_ID"),
    prokeralaClientId: setting("prokeralaClientId", "PROKERALA_CLIENT_ID"),
    prokeralaClientSecret: setting("prokeralaClientSecret", "PROKERALA_CLIENT_SECRET"),
    astrologyApiUserId: setting("astrologyApiUserId", "ASTROLOGY_API_USER_ID"),
    astrologyApiKey: setting("astrologyApiKey", "ASTROLOGY_API_KEY"),
  };

  const dbRows = DB_KEYS.map((k) => ({
    key: k,
    label: DB_LABELS[k],
    id: cfg.notionDb?.[k] || dbMap[k],
    overridden: Boolean(cfg.notionDb?.[k]),
  }));

  const backend = store().backend;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Support · Configuration</div>
          <h1 className="brand-serif">Settings</h1>
        </div>
        {AUTH_ENABLED && user && (
          <div className="topbar-actions">
            <a className="btn-ghost" href="/api/auth/signout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </a>
          </div>
        )}
      </div>

      <SettingsTabs
        tabs={[
          {
            id: "notion",
            label: "Notion",
            content: (
              <>
                <NotionConnectCard
                  connected={notionOk}
                  workspaceName={cfg.notionWorkspaceName || (usingInstallKey ? "Install workspace" : null)}
                  authType={cfg.notionAuthType}
                  connectedAt={cfg.notionConnectedAt}
                  maskedToken={maskSecret(ownToken)}
                  oauthAvailable={oauthConfigured()}
                  usingInstallKey={usingInstallKey}
                />
                {notionOk && <ProjectFieldsCard />}
                {notionOk && <DatabaseMappingCard rows={dbRows} />}
              </>
            ),
          },
          {
            id: "ai",
            label: "AI",
            content: (
              <>
                <PreferencesCard
                  title="AI model & key"
                  sub="Powers Advisor Chat, the floating Assistant, the AI Day Plan, portfolio insights and slip scanning. Your key is stored encrypted and used only for your own requests."
                  values={{
                    openRouterApiKey: "",
                    openRouterModel: cfg.openRouterModel || "",
                    openRouterVisionModel: cfg.openRouterVisionModel || "",
                  }}
                  fields={[
                    {
                      key: "openRouterApiKey",
                      label: "OpenRouter API key",
                      type: "password",
                      placeholder: ownOpenRouter ? maskSecret(ownOpenRouter) : "sk-or-…",
                      hint: ownOpenRouter
                        ? "A key is saved. Type a new one to replace it, or leave this blank to keep it."
                        : installOpenRouter
                          ? "This install has a shared key. Add your own to be billed separately."
                          : "Get one at openrouter.ai/keys.",
                    },
                    {
                      key: "openRouterModel",
                      label: "Text model",
                      placeholder: "deepseek/deepseek-chat",
                      hint: `Currently using ${openrouterModel}.`,
                    },
                    {
                      key: "openRouterVisionModel",
                      label: "Vision model (slip scanning)",
                      placeholder: "google/gemini-2.5-flash",
                      hint: `Currently using ${visionModel}. Must be vision-capable or slip scanning will fail.`,
                    },
                  ]}
                  fallbackNote="Any field left blank falls back to this install's environment configuration."
                />

                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Connection status</span>
                  </div>
                  <div style={{ padding: "6px 16px 14px 16px" }}>
                    <Row label="Notion (all data tabs)" value={notionOk ? "Connected" : "Not connected"} ok={notionOk} />
                    <Row
                      label="OpenRouter — chat, assistant, insights"
                      value={openRouterConnected ? `Connected · ${openrouterModel}` : "Not connected"}
                      ok={openRouterConnected}
                    />
                    <Row
                      label="OpenRouter — slip scanner (vision)"
                      value={openRouterConnected ? `Connected · ${visionModel}` : "Not connected"}
                      ok={openRouterConnected}
                    />
                    <Row label="Prokerala (astrology transits)" value={prokeralaConnected ? "Connected" : "Not set"} ok={prokeralaConnected} />
                    <Row label="AstrologyAPI.com (astrology transits)" value={astrologyApiConnected ? "Connected" : "Not set"} ok={astrologyApiConnected} />
                    <Row label="Google Calendar" value={googleConnected ? "Connected" : "Not set up yet"} ok={googleConnected} />
                    <Row label="Rahu Kalam / Yamagandam / Gulika Kalam" value="Computed locally — always on" ok />
                  </div>
                </div>
              </>
            ),
          },
          {
            id: "personal",
            label: "Personal",
            content: (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Appearance</span>
                  </div>
                  <div style={{ padding: "6px 16px 14px 16px" }}>
                    <ThemeToggleRow />
                  </div>
                </div>

                <PreferencesCard
                  title="Location & birth date"
                  sub="Used for Rahu Kalam / Yamagandam / Gulika Kalam timings, sunrise-based day logic, and the numerology feeding Today and Rules."
                  values={{
                    homeLat: cfg.homeLat || "",
                    homeLon: cfg.homeLon || "",
                    homeTzOffset: cfg.homeTzOffset || "",
                    birthDate: cfg.birthDate || "",
                  }}
                  fields={[
                    { key: "homeLat", label: "Latitude", placeholder: setting("homeLat", "HOME_LAT") || "51.5074" },
                    { key: "homeLon", label: "Longitude", placeholder: setting("homeLon", "HOME_LON") || "-0.1278" },
                    {
                      key: "homeTzOffset",
                      label: "Timezone offset (hours from UTC)",
                      placeholder: setting("homeTzOffset", "HOME_TZ_OFFSET") || "0",
                      hint: "Hours from UTC — e.g. 5.5 for Sri Lanka, -5 for New York. This decides what counts as “today”.",
                    },
                    {
                      key: "birthDate",
                      label: "Birth date",
                      type: "date",
                      hint: "Feeds the local numerology calculations. Nothing is sent anywhere.",
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: "integrations",
            label: "Integrations",
            content: (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Install-level integrations</span>
                    <div className="spacer" />
                    <span className="count-chip">shared</span>
                  </div>
                  <div style={{ padding: "14px 16px", fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-muted)" }}>
                    Unlike Notion and your AI key, the settings below belong to the whole install rather than to your
                    account, and are written to <code>data/app-settings.json</code>. On a read-only host such as Vercel
                    that file cannot be written — set these as environment variables there instead.
                  </div>
                </div>

                <SettingsSection
                  title="Google Calendar"
                  sub="Powers the “Add to Calendar” button on project deadlines. Needs a Google Cloud service account with your calendar shared to it."
                  fields={[
                    { key: "googleServiceAccountEmail", label: "Service account email", placeholder: "orex-cal@project.iam.gserviceaccount.com" },
                    { key: "googleServiceAccountPrivateKey", label: "Service account private key", type: "textarea", placeholder: "-----BEGIN PRIVATE KEY-----…" },
                    { key: "googleCalendarId", label: "Calendar ID", placeholder: "you@gmail.com" },
                  ]}
                  values={installValues}
                />

                <SettingsSection
                  title="Astrology APIs"
                  sub="Optional. Only powers the “Current Transits” card on Astro Lab — Rahu Kalam and friends are computed locally either way."
                  fields={[
                    { key: "prokeralaClientId", label: "Prokerala client ID" },
                    { key: "prokeralaClientSecret", label: "Prokerala client secret", type: "password" },
                    { key: "astrologyApiUserId", label: "AstrologyAPI user ID" },
                    { key: "astrologyApiKey", label: "AstrologyAPI key", type: "password" },
                  ]}
                  values={installValues}
                />
              </>
            ),
          },
          {
            id: "account",
            label: "Account",
            content: (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Account</span>
                    <div className="spacer" />
                    <span className="count-chip">{AUTH_ENABLED ? "Signed in" : "Local mode"}</span>
                  </div>
                  <div style={{ padding: "6px 16px 14px 16px" }}>
                    {AUTH_ENABLED ? (
                      <>
                        <Row label="Name" value={user?.name || "—"} ok={Boolean(user?.name)} />
                        <Row label="Email" value={user?.email || "—"} ok={Boolean(user?.email)} />
                      </>
                    ) : (
                      <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-secondary)", padding: "8px 0 12px 0" }}>
                        This install runs without logins — everyone who can reach it shares one configuration from{" "}
                        <code>.env.local</code>. To turn on social sign-in, set <code>AUTH_SECRET</code> plus{" "}
                        <code>AUTH_GOOGLE_ID</code>/<code>AUTH_GOOGLE_SECRET</code> or{" "}
                        <code>AUTH_GITHUB_ID</code>/<code>AUTH_GITHUB_SECRET</code>.
                      </div>
                    )}
                    <Row
                      label="Settings storage"
                      value={backend === "postgres" ? "Postgres" : backend === "sqlite" ? "SQLite (local file)" : "In memory — not persisted"}
                      ok={backend !== "memory"}
                    />
                    <Row
                      label="Secret encryption"
                      value={encryptionAvailable() ? "AES-256-GCM" : "Off — set AUTH_SECRET"}
                      ok={encryptionAvailable()}
                    />
                  </div>
                </div>

                <AccountDataCard authEnabled={AUTH_ENABLED} />
              </>
            ),
          },
        ]}
      />

      <div className="footnote">Orex OS — Settings</div>
    </>
  );
}
