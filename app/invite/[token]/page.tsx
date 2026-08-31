import { redirect } from "next/navigation";
import { getInvite } from "@/lib/invites";
import { currentUser } from "@/auth";
import InviteForm from "@/components/InviteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join · Orex OS" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Already signed in → no need to accept an invite.
  if (await currentUser()) redirect("/");

  const invite = await getInvite(token);
  if (!invite) {
    return (
      <div className="auth-shell">
        <div className="auth-brand" aria-hidden="true">
          <div className="auth-brand-top">
            <div className="auth-brand-mark">
              <div className="auth-brand-o brand-serif">O</div>
              <div>
                <div className="auth-brand-name">Orex OS</div>
                <div className="auth-brand-tagline">Personal &amp; Company Intelligence</div>
              </div>
            </div>
          </div>
          <div className="auth-brand-dots" />
          <div className="auth-brand-footer">Orex OS · {new Date().getFullYear()}</div>
        </div>
        <div className="auth-form-panel">
          <div className="auth-card-wrap">
            <div className="card auth-card">
              <h1 className="auth-title">Invite not found</h1>
              <p className="auth-sub">
                This invite link has expired, already been used, or doesn&apos;t exist.
                Ask the workspace owner for a new one.
              </p>
              <a href="/login" className="btn-ghost auth-submit" style={{ display: "block", textAlign: "center", marginTop: 8 }}>
                Back to sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      {/* Brand panel */}
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-top">
          <div className="auth-brand-mark">
            <div className="auth-brand-o brand-serif">O</div>
            <div>
              <div className="auth-brand-name">Orex OS</div>
              <div className="auth-brand-tagline">Personal &amp; Company Intelligence</div>
            </div>
          </div>
          <h2 className="auth-brand-headline">
            You&apos;ve been<br />
            invited to<br />
            <em>Orex OS.</em>
          </h2>
          <p className="auth-brand-desc">
            Set a password below to activate your account. You&apos;ll connect
            your own Notion workspace after signing in — your data stays
            private in your own Notion.
          </p>
        </div>
        <div className="auth-brand-dots" />
        <div className="auth-brand-footer">Orex OS · {new Date().getFullYear()}</div>
      </aside>

      {/* Form panel */}
      <div className="auth-form-panel">
        <div className="auth-card-wrap">
          <div className="card auth-card">
            <h1 className="auth-title">Set up your account</h1>
            <p className="auth-sub">
              Joining as <strong>{invite.email}</strong>. Pick a display name and a password.
            </p>
            <InviteForm token={token} email={invite.email} />
          </div>
        </div>
      </div>
    </div>
  );
}
