"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface SidebarWorkspace {
  /** Company/project rows rendered with their own colour, like a real workspace rail. */
  id: string;
  name: string;
  colorVar: string;
  href: string;
}

export interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  /** Groups can be folded away; the choice is remembered per browser. */
  collapsible?: boolean;
  addHref?: string;
}

const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

const ICONS = {
  home: icon(
    <>
      <path d="M3 12l9-8 9 8" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </>
  ),
  chat: icon(
    <>
      <path d="M8 9h8M8 13h5" />
      <path d="M21 12a9 9 0 1 1-4.2-7.6L21 3v5h-5" />
    </>
  ),
  projects: icon(
    <>
      <rect x="3" y="7" width="18" height="13" rx="1.8" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  queue: icon(
    <>
      <rect x="3" y="4" width="18" height="4" rx="1.2" />
      <rect x="3" y="10" width="18" height="4" rx="1.2" />
      <rect x="3" y="16" width="10" height="4" rx="1.2" />
    </>
  ),
  finance: icon(
    <>
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  building: icon(
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.6" />
      <path d="M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1" />
    </>
  ),
  clients: icon(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  payments: icon(
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 10h19" />
    </>
  ),
  team: icon(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.6" />
      <path d="M15.5 14.2c2.7.4 4.5 2.7 4.5 5.8" />
    </>
  ),
  ideas: icon(
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
    </>
  ),
  learning: icon(
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </>
  ),
  logs: icon(
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  astro: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  sleep: icon(<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />),
  rules: icon(
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  slips: icon(
    <>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" />
      <path d="M9.5 7h5M9.5 11h5M9.5 15h3" />
    </>
  ),
};

const GROUPS: NavGroup[] = [
  {
    key: "essentials",
    label: "Essentials",
    items: [
      { label: "Today", href: "/", icon: ICONS.home },
      { label: "Advisor Chat", href: "/advisor", icon: ICONS.chat },
      { label: "Projects", href: "/projects", icon: ICONS.projects },
      { label: "Render Queue", href: "/render-queue", icon: ICONS.queue },
      { label: "Finance", href: "/finance", icon: ICONS.finance },
      { label: "Slip Inbox", href: "/finance/slips", icon: ICONS.slips },
    ],
  },
  {
    key: "management",
    label: "Management",
    collapsible: true,
    items: [
      { label: "Companies", href: "/companies", icon: ICONS.building },
      { label: "Clients", href: "/clients", icon: ICONS.clients },
      { label: "Payments", href: "/payments", icon: ICONS.payments },
      { label: "Team", href: "/team", icon: ICONS.team },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    collapsible: true,
    items: [
      { label: "Ideas Inbox", href: "/ideas", icon: ICONS.ideas },
      { label: "Learning", href: "/learning", icon: ICONS.learning },
      { label: "Daily Logs", href: "/daily-logs", icon: ICONS.logs },
    ],
  },
  {
    key: "self",
    label: "Self",
    collapsible: true,
    items: [
      { label: "Astro Lab", href: "/astro-lab", icon: ICONS.astro },
      { label: "Sleep Cycle", href: "/sleep", icon: ICONS.sleep },
      { label: "Rules", href: "/rules", icon: ICONS.rules },
    ],
  },
  {
    key: "support",
    label: "Support",
    collapsible: true,
    items: [{ label: "Settings", href: "/settings", icon: ICONS.settings }],
  },
];

const MOBILE_NAV = [
  { label: "Today", href: "/", icon: ICONS.home },
  { label: "Projects", href: "/projects", icon: ICONS.projects },
  { label: "Finance", href: "/finance", icon: ICONS.finance },
  { label: "Slips", href: "/finance/slips", icon: ICONS.slips },
  { label: "Settings", href: "/settings", icon: ICONS.settings },
];

function initials(s: string) {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function Plus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export default function Sidebar({
  workspaces = [],
  user = null,
  workspaceLabel = "Orex OS",
  orgLabel = "Personal & Company Intelligence",
  authEnabled = false,
}: {
  workspaces?: SidebarWorkspace[];
  user?: SidebarUser | null;
  workspaceLabel?: string;
  orgLabel?: string;
  authEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
    try {
      const raw = localStorage.getItem("orex-nav-collapsed");
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
  }, [pathname]);

  // ⌘K / ⌘F opens the palette. ⌘F is what the reference rail advertises, but
  // browsers own it, so both are bound and ⌘K is the one that always lands.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("orex-nav-collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("orex-theme", next ? "dark" : "light");
    } catch {}
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "Your workspace";
  const displayRole = user?.email || "Not signed in";

  return (
    <>
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className={`mobile-overlay${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <div className="ws-card">
          <div className="ws-mark brand-serif">{workspaceLabel.slice(0, 1).toUpperCase()}</div>
          <div className="ws-text">
            <div className="ws-name">{workspaceLabel}</div>
            <div className="ws-org">{orgLabel}</div>
          </div>
          <button className="ws-action" onClick={() => setMobileOpen(false)} aria-label="Collapse sidebar" title="Collapse">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>

        <button className="side-search" onClick={() => setPaletteOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search
          <span className="kbd">⌘K</span>
        </button>

        {GROUPS.map((group, gi) => {
          const isCollapsed = Boolean(group.collapsible && collapsed[group.key]);
          return (
            <div className="nav-group" key={group.key}>
              <button
                className={`nav-group-head${isCollapsed ? " collapsed" : ""}`}
                onClick={() => group.collapsible && toggleGroup(group.key)}
                type="button"
              >
                {group.collapsible ? <Chevron /> : <span style={{ width: 12, flexShrink: 0 }} />}
                <span className="label">{group.label}</span>
              </button>
              <div className={`nav-group-body${isCollapsed ? " hidden" : ""}`}>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${pathname === item.href ? " active" : ""}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* The live company rail sits directly under Essentials, the way a
                  real workspace switcher does — colour-coded, always current. */}
              {gi === 0 && workspaces.length > 0 && (
                <div className="nav-group" style={{ marginTop: 2 }}>
                  <button
                    className={`nav-group-head${collapsed.workspaces ? " collapsed" : ""}`}
                    onClick={() => toggleGroup("workspaces")}
                    type="button"
                  >
                    <Chevron />
                    <span className="label">Companies</span>
                    <span className="tools">
                      <span onClick={(e) => { e.stopPropagation(); router.push("/companies"); }}>
                        <Plus />
                      </span>
                    </span>
                  </button>
                  <div className={`nav-group-body${collapsed.workspaces ? " hidden" : ""}`}>
                    {workspaces.slice(0, 8).map((w) => (
                      <Link key={w.id} href={w.href} className={`nav-item${pathname === w.href ? " active" : ""}`}>
                        <span className="nav-swatch" style={{ background: `var(${w.colorVar})` }}>
                          {initials(w.name)}
                        </span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {w.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div className="avatar">
            {user?.image ? (
              <Image src={user.image} alt="" width={26} height={26} unoptimized />
            ) : (
              initials(displayName)
            )}
          </div>
          <div className="who">
            <div className="name">{displayName}</div>
            <div className="role">{displayRole}</div>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          {authEnabled && (
            <a className="ws-action" href="/api/auth/signout" title="Sign out" aria-label="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5M21 12H9" />
              </svg>
            </a>
          )}
        </div>
      </aside>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          groups={GROUPS}
          workspaces={workspaces}
          onGo={(href) => {
            setPaletteOpen(false);
            router.push(href);
          }}
        />
      )}

      <nav className="mobile-bottom-nav">
        {MOBILE_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`mobile-bottom-nav-item${pathname === item.href ? " active" : ""}`}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

/** ⌘K jump-to. Searches every nav destination plus the live company list. */
function CommandPalette({
  onClose,
  groups,
  workspaces,
  onGo,
}: {
  onClose: () => void;
  groups: NavGroup[];
  workspaces: SidebarWorkspace[];
  onGo: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const all = [
      ...groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, group: g.label, color: null as string | null }))),
      ...workspaces.map((w) => ({ label: w.name, href: w.href, group: "Companies", color: w.colorVar })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 10);
    return all.filter((r) => r.label.toLowerCase().includes(needle) || r.group.toLowerCase().includes(needle)).slice(0, 10);
  }, [q, groups, workspaces]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      onGo(results[cursor].href);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: "flex-start", paddingTop: "12vh" }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or company…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, width: "100%", color: "var(--ink)", fontFamily: "inherit" }}
          />
          <span className="kbd" style={{ fontSize: 10.5, border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px", color: "var(--ink-muted)" }}>
            esc
          </span>
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--ink-muted)", textAlign: "center" }}>
              Nothing matches “{q}”.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.href}-${r.label}`}
                onClick={() => onGo(r.href)}
                onMouseEnter={() => setCursor(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13,
                  background: i === cursor ? "var(--rail)" : "transparent",
                  color: "var(--ink)",
                }}
              >
                {r.color ? (
                  <span className="nav-swatch" style={{ background: `var(${r.color})` }}>{initials(r.label)}</span>
                ) : (
                  <span className="nav-swatch" style={{ background: "var(--border-strong)" }} />
                )}
                <span style={{ fontWeight: 550 }}>{r.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-muted)" }}>{r.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
