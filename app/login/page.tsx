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

function AppleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.5ZM14.2 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" />
    </svg>
  );
}

const MARKS: Record<string, React.ReactNode> = {
  google: <GoogleMark />,
  github: <GitHubMark />,
  apple: <AppleMark />,
};

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
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <div className="card auth-card">
          <div className="ws-mark brand-serif auth-mark">O</div>

          {!PASSWORD_LOGIN_ENABLED && (
            <>
              <h1 className="auth-title">Sign in to Orex OS</h1>
              <p className="auth-sub">
                Every account connects its own Notion workspace — your projects, finances and notes stay in your
                Notion, never in a shared database here.
              </p>
            </>
          )}

          {errorMessage && <div className="auth-error">{errorMessage}</div>}

          {PASSWORD_LOGIN_ENABLED && (
            <LoginForm
              callbackUrl={callbackUrl || "/"}
              signupEnabled={SIGNUP_ENABLED}
              minPasswordLength={MIN_PASSWORD_LENGTH}
            />
          )}

          {PASSWORD_LOGIN_ENABLED && AVAILABLE_PROVIDERS.length > 0 && (
            <div className="auth-or">
              <span />
              <em>or</em>
              <span />
            </div>
          )}

          <div className="auth-providers">
            {AVAILABLE_PROVIDERS.map((p) => (
              <form
                key={p.id}
                action={async () => {
                  "use server";
                  await signIn(p.id, { redirectTo: callbackUrl || "/" });
                }}
              >
                <button type="submit" className="btn-ghost auth-provider">
                  {MARKS[p.id]}
                  Continue with {p.name}
                </button>
              </form>
            ))}
          </div>

          <div className="auth-foot">
            <strong>Your workspace is yours.</strong> After signing in, connect your own Notion integration token and
            database IDs under <strong>Settings → Notion</strong>. Every query is scoped to the signed-in account, so
            no other account can read your databases — and nothing is read from Notion until you connect it.
          </div>
        </div>

        <div className="auth-tagline">Orex OS · Personal &amp; Company Intelligence</div>
      </div>
    </div>
  );
}
