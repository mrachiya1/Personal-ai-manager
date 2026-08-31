"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Inviting people, and deciding exactly what each of them can see.
 *
 * The design problem here is that a permission screen is usually a list of
 * switches whose consequences nobody can picture. So this one is built the
 * other way round: you pick the WORK first — these companies, these projects,
 * this one task — and the role only decides how much of each record comes
 * with it. And before the invite goes out, the screen states in a sentence
 * what the person will actually see, using the names of real things.
 *
 * Nothing here can share the owner's personal data, because there is no
 * control for it. That is not an oversight — see lib/sharing.ts.
 */

/**
 * One tickable thing. `parentId` is what it belongs to — a project's company,
 * a task's project — which is how the picker works out that ticking a company
 * has already covered the projects inside it.
 */
interface Option { id: string; name: string; parentId?: string }
interface RoleInfo { id: string; name: string; blurb: string }
interface Member {
  userKey: string; email: string; name?: string; role: string;
  companyIds: string[]; projectIds: string[]; taskIds: string[];
  createdAt: string; suspendedAt?: string;
}
interface Invite {
  id: string; email: string; role: string; createdAt: string; expiresAt: string;
  acceptedAt: string | null; revokedAt: string | null;
  companyIds: string[]; projectIds: string[]; taskIds: string[];
}

export default function TeamSettings({
  companies,
  projects,
  tasks,
  authEnabled,
}: {
  companies: Option[];
  projects: Option[];
  tasks: Option[];
  authEnabled: boolean;
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [message, setMessage] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = async () => {
    const [i, m] = await Promise.all([
      fetch("/api/team/invites").then((r) => r.json()).catch(() => ({})),
      fetch("/api/team/members").then((r) => r.json()).catch(() => ({})),
    ]);
    if (i.roles) setRoles(i.roles);
    if (i.invites) setInvites(i.invites);
    if (m.members) setMembers(m.members);
    setLoading(false);
  };

  useEffect(() => {
    if (authEnabled) void reload();
    else setLoading(false);
  }, [authEnabled]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // Projects already covered by a ticked company are shown as covered rather
  // than as a separate choice — ticking them again does nothing, and a
  // control that does nothing is a control that teaches people to distrust
  // the screen.
  const coveredProjectIds = useMemo(
    () => new Set(projects.filter((p) => p.parentId && companyIds.includes(p.parentId)).map((p) => p.id)),
    [projects, companyIds]
  );
  const coveredTaskIds = useMemo(() => {
    const reachable = new Set([...coveredProjectIds, ...projectIds]);
    return new Set(tasks.filter((t) => t.parentId && reachable.has(t.parentId)).map((t) => t.id));
  }, [tasks, coveredProjectIds, projectIds]);

  const grantCount = companyIds.length + projectIds.filter((id) => !coveredProjectIds.has(id)).length +
    taskIds.filter((id) => !coveredTaskIds.has(id)).length;

  const roleInfo = roles.find((r) => r.id === role);

  const send = async () => {
    setBusy(true);
    setError("");
    setLink(null);
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, message, companyIds, projectIds, taskIds }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || `Server returned ${res.status}`);
      setLink({ url: body.url, email: body.invite.email });
      setEmail("");
      setMessage("");
      setCompanyIds([]);
      setProjectIds([]);
      setTaskIds([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the invitation");
    } finally {
      setBusy(false);
    }
  };

  const patchMember = async (userKey: string, patch: Record<string, unknown>) => {
    await fetch(`/api/team/members/${encodeURIComponent(userKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reload();
  };

  const removeMember = async (userKey: string, who: string) => {
    if (!confirm(`Remove ${who}? They lose access to everything shared here. Their own Notion is not touched.`)) return;
    await fetch(`/api/team/members/${encodeURIComponent(userKey)}`, { method: "DELETE" });
    await reload();
  };

  const revoke = async (id: string) => {
    await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
    await reload();
  };

  if (!authEnabled) {
    return (
      <section className="card section-card">
        <h2>Team</h2>
        <p className="section-sub">
          Inviting people needs sign-in switched on. Set <code>AUTH_SECRET</code> in the environment and redeploy —
          without it there are no accounts to invite anyone into, and everyone who reached the URL would share one
          workspace.
        </p>
      </section>
    );
  }

  const pending = invites.filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > new Date().toISOString());

  return (
    <>
      {/* ---------------- who is already here ---------------- */}
      <section className="card section-card">
        <div className="tm-head">
          <div>
            <h2>Your team</h2>
            <p className="section-sub">
              Everyone here reads only what you ticked for them, live from your Notion. They keep their own separate
              Notion for their own work, which you cannot see and they never lose.
            </p>
          </div>
          <span className="tm-count">{members.length}</span>
        </div>

        {loading ? (
          <p className="join-quiet">Loading…</p>
        ) : members.length === 0 ? (
          <p className="tm-empty">Nobody yet. Invite someone below — it takes about twenty seconds.</p>
        ) : (
          <ul className="tm-list">
            {members.map((m) => (
              <li key={m.userKey} className={`tm-member${m.suspendedAt ? " suspended" : ""}`}>
                <div className="tm-who">
                  <span className="tm-name">{m.name || m.email}</span>
                  <span className="tm-email">{m.email}</span>
                </div>
                <div className="tm-scope">
                  {describeGrant(m, companies, projects, tasks)}
                  {m.suspendedAt && <em> · suspended</em>}
                </div>
                <select
                  className="tm-role"
                  value={m.role}
                  onChange={(e) => void patchMember(m.userKey, { role: e.target.value })}
                  aria-label={`Role for ${m.email}`}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="tm-member-actions">
                  <button className="btn-ghost sm" onClick={() => void patchMember(m.userKey, { suspended: !m.suspendedAt })}>
                    {m.suspendedAt ? "Restore" : "Suspend"}
                  </button>
                  <button className="btn-ghost sm danger" onClick={() => void removeMember(m.userKey, m.name || m.email)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- inviting ---------------- */}
      <section className="card section-card">
        <h2>Invite someone</h2>
        <p className="section-sub">
          Pick the work first, then the role. The role decides how much of each record they see — not which records.
        </p>

        {link && (
          <div className="tm-link">
            <strong>Invitation ready for {link.email}.</strong>
            <p>
              Send them this link. It works once, expires in fourteen days, and it is shown here only now — the token
              is not stored, so it cannot be looked up again. Lost links get re-issued, not recovered.
            </p>
            <div className="tm-link-row">
              <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <button
                className="btn-save"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {error && <div className="join-error">{error}</div>}

        <div className="tm-form">
          <label className="tm-field">
            <span>Their email</span>
            <input
              type="email"
              value={email}
              placeholder="name@company.com"
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>

          <fieldset className="tm-roles">
            <legend>Role</legend>
            {roles.map((r) => (
              <label key={r.id} className={`tm-role-opt${role === r.id ? " on" : ""}`}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} />
                <span className="tm-role-name">{r.name}</span>
                <span className="tm-role-blurb">{r.blurb}</span>
              </label>
            ))}
          </fieldset>

          <div className="tm-picker">
            <h3>Companies</h3>
            <p className="tm-hint">Everything inside them: projects, tasks, deadlines{roleInfo?.id === "manager" ? ", clients and invoices" : ""}.</p>
            {companies.length === 0 ? (
              <p className="tm-empty">No companies in your Notion yet.</p>
            ) : (
              <div className="tm-chips">
                {companies.map((c) => (
                  <label key={c.id} className={`tm-chip${companyIds.includes(c.id) ? " on" : ""}`}>
                    <input type="checkbox" checked={companyIds.includes(c.id)} onChange={() => toggle(companyIds, setCompanyIds, c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="tm-picker">
            <button type="button" className="tm-disclose" onClick={() => setShowProjects((v) => !v)} aria-expanded={showProjects}>
              {showProjects ? "−" : "+"} Individual projects
              {projectIds.length > 0 && <span className="tm-badge">{projectIds.length}</span>}
            </button>
            {showProjects && (
              <div className="tm-chips">
                {projects.map((p) => {
                  const covered = coveredProjectIds.has(p.id);
                  return (
                    <label key={p.id} className={`tm-chip${projectIds.includes(p.id) ? " on" : ""}${covered ? " covered" : ""}`}>
                      <input
                        type="checkbox"
                        disabled={covered}
                        checked={covered || projectIds.includes(p.id)}
                        onChange={() => toggle(projectIds, setProjectIds, p.id)}
                      />
                      {p.name}
                      {covered && <em> · via company</em>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="tm-picker">
            <button type="button" className="tm-disclose" onClick={() => setShowTasks((v) => !v)} aria-expanded={showTasks}>
              {showTasks ? "−" : "+"} Individual tasks
              {taskIds.length > 0 && <span className="tm-badge">{taskIds.length}</span>}
            </button>
            {showTasks && (
              <>
                <p className="tm-hint">
                  A single task brings its project name along so it has context — nothing else from that project.
                </p>
                <div className="tm-chips">
                  {tasks.map((t) => {
                    const covered = coveredTaskIds.has(t.id);
                    return (
                      <label key={t.id} className={`tm-chip${taskIds.includes(t.id) ? " on" : ""}${covered ? " covered" : ""}`}>
                        <input
                          type="checkbox"
                          disabled={covered}
                          checked={covered || taskIds.includes(t.id)}
                          onChange={() => toggle(taskIds, setTaskIds, t.id)}
                        />
                        {t.name}
                        {covered && <em> · already included</em>}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <label className="tm-field">
            <span>A note for them (optional)</span>
            <textarea
              rows={2}
              value={message}
              placeholder="What you'd like them to pick up first."
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {/* The sentence that makes the switches mean something. */}
          <div className="tm-summary">
            {grantCount === 0 ? (
              <>Tick at least one company, project or task — an invitation that shares nothing just confuses whoever accepts it.</>
            ) : (
              <>
                <strong>{email || "They"}</strong> will see{" "}
                {describeSelection(companyIds, projectIds.filter((id) => !coveredProjectIds.has(id)), taskIds.filter((id) => !coveredTaskIds.has(id)), companies, projects, tasks)}
                {roleInfo?.id === "manager" ? ", including invoices and client details for those companies" : ""}
                {roleInfo?.id === "member" ? ", without any invoice, project value or client contact" : ""}
                {roleInfo?.id === "viewer" ? ", read-only, without any money or client contact" : ""}. Nothing else in
                your workspace, and none of your personal records.
              </>
            )}
          </div>

          <div className="join-actions">
            <button className="btn-save" onClick={() => void send()} disabled={busy || !email || grantCount === 0}>
              {busy ? "Creating…" : "Create invitation link"}
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- outstanding ---------------- */}
      {pending.length > 0 && (
        <section className="card section-card">
          <h2>Waiting to be accepted</h2>
          <ul className="tm-list">
            {pending.map((i) => (
              <li key={i.id} className="tm-member">
                <div className="tm-who">
                  <span className="tm-name">{i.email}</span>
                  <span className="tm-email">
                    {roles.find((r) => r.id === i.role)?.name} · expires {i.expiresAt.slice(0, 10)}
                  </span>
                </div>
                <div className="tm-scope">{describeGrant(i, companies, projects, tasks)}</div>
                <div className="tm-member-actions">
                  <button className="btn-ghost sm danger" onClick={() => void revoke(i.id)}>
                    Withdraw
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function names(ids: string[], from: Option[]): string[] {
  const map = new Map(from.map((o) => [o.id, o.name]));
  return ids.map((id) => map.get(id)).filter(Boolean) as string[];
}

/** "Orex Studio, plus 2 projects" — names where there are few, counts where many. */
function describeSelection(
  companyIds: string[], projectIds: string[], taskIds: string[],
  companies: Option[], projects: Option[], tasks: Option[]
): string {
  const parts: string[] = [];
  const co = names(companyIds, companies);
  if (co.length) parts.push(co.length <= 3 ? co.join(", ") : `${co.length} companies`);
  const pr = names(projectIds, projects);
  if (pr.length) parts.push(pr.length <= 2 ? pr.join(", ") : `${pr.length} projects`);
  const tk = names(taskIds, tasks);
  if (tk.length) parts.push(tk.length <= 2 ? tk.join(", ") : `${tk.length} tasks`);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

function describeGrant(
  g: { companyIds: string[]; projectIds: string[]; taskIds: string[] },
  companies: Option[], projects: Option[], tasks: Option[]
): string {
  return describeSelection(g.companyIds, g.projectIds, g.taskIds, companies, projects, tasks);
}
