import { redirect } from "next/navigation";
import {
  AUTH_ENABLED,
  AVAILABLE_PROVIDERS,
  PASSWORD_LOGIN_ENABLED,
  SIGNUP_ENABLED,
  currentUser,
  signIn,
} from "@/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/accounts";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Orex OS" };

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.6c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.8C7.9 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 28c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.8H4.3C2.8 17 2 20.4 2 24s.8 7 2.3 10l7.3-6z" />
      <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14l7.3 5.8c1.8-5.2 6.6-9 12.4-9z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0C17.7 4.7 18.7 5 18.7 5c.6 1.7.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

const MARKS: Record<string, React.ReactNode> = { google: <GoogleMark />, github: <GitHubMark /> };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl = "/", error } = await searchParams;

  if (!AUTH_ENABLED) redirect("/");
  if (await currentUser()) redirect(callbackUrl || "/");

  const errorMessage =
    error === "AccessDenied"
      ? "That account isn't on this instance's allow-list. Ask the owner to add your email address."
      : error && error !== "CredentialsSignin"
        ? "Sign-in didn't complete. Try again, or use a different method."
        : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "var(--field)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 386 }}>
        <div
          className="card"
          style={{
            background: "var(--surface-raised)",
            borderRadius: 18,
            padding: "32px 30px 26px 30px",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <div
            className="ws-mark brand-serif"
            style={{ width: 40, height: 40, borderRadius: 11, fontSize: 18, marginBottom: 18 }}
          >
            O
          </div>

          {!PASSWORD_LOGIN_ENABLED && (
            <>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em" }}>
                Sign in to Orex OS
              </h1>
              <p style={{ margin: "8px 0 22px 0", fontSize: 13, lineHeight: 1.6, color: "var(--ink-muted)" }}>
                Projects, finances and AI slip scanning. Every account connects its own Notion workspace — your data
                stays in your Notion, not here.
              </p>
            </>
          )}

          {errorMessage && (
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--critical-ink)",
                background: "var(--critical-bg)",
                border: "1px solid rgba(208,59,59,0.25)",
                borderRadius: 9,
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              {errorMessage}
            </div>
          )}

          {PASSWORD_LOGIN_ENABLED && (
            <LoginForm
              callbackUrl={callbackUrl || "/"}
              signupEnabled={SIGNUP_ENABLED}
              minPasswordLength={MIN_PASSWORD_LENGTH}
            />
          )}

          {PASSWORD_LOGIN_ENABLED && AVAILABLE_PROVIDERS.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px 0" }}>
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>or</span>
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {AVAILABLE_PROVIDERS.map((p) => (
              <form
                key={p.id}
                action={async () => {
                  "use server";
                  await signIn(p.id, { redirectTo: callbackUrl || "/" });
                }}
              >
                <button
                  type="submit"
                  className="btn-ghost"
                  style={{ width: "100%", justifyContent: "center", padding: "11px 14px", fontSize: 13.5, borderRadius: 10 }}
                >
                  {MARKS[p.id]}
                  Continue with {p.name}
                </button>
              </form>
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 15,
              borderTop: "1px solid var(--border)",
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--ink-muted)",
            }}
          >
            After signing in, open <strong style={{ color: "var(--ink-secondary)" }}>Settings → Notion</strong> to
            connect your workspace. Nothing is read from Notion until you do.
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-muted)", marginTop: 16 }}>
          Orex OS · Personal &amp; Company Intelligence
        </div>
      </div>
    </div>
  );
}
