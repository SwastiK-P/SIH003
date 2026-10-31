import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSession, useLive, type Role } from "../lib/session";
import { api } from "../lib/api";
import { initials, n } from "../lib/format";
import { BrandIcon, ROW_ICON, type RowName } from "./Drawings";
import { Icon } from "./Icons";
import { MenuButton, MenuItem } from "./ui";

interface NavItem { to: string; label: string; art: RowName; count?: string; tone?: "bad"; end?: boolean }

export function Brand({ sub = "AICTE · Student Records", size = 32 }: { sub?: string | null; size?: number }) {
  return <span className="brand"><BrandIcon size={size} /><span className="brand-text"><b>APAAR Registry</b>{sub && <span>{sub}</span>}</span></span>;
}

const ROLE_LABEL: Record<Role, string> = { aicte: "AICTE", institution: "Institution", verifier: "Verifier", student: "Student" };

/** Counts beside the sidebar rows, kept current by live events. */
function useCounts(role: Role, institutionId: string | null) {
  const [c, setC] = useState<Record<string, number>>({});
  const load = () => {
    if (role === "institution" && institutionId) api(`/institutions/${institutionId}`).then((d) => setC({ students: d.summary.enrolled, errors: d.summary.errors, warnings: d.summary.warnings })).catch(() => {});
    if (role === "aicte") api("/national/overview").then((d) => setC({ institutions: d.kpis.institutions, review: d.kpis.submitted - d.kpis.accepted, conflicts: d.kpis.conflicts })).catch(() => {});
    if (role === "student") api("/student/me").then((d) => setC({ pending: d.consents.filter((x: any) => x.status === "pending").length })).catch(() => {});
    if (role === "verifier") api("/verifier/requests").then((d) => setC({ granted: d.requests.filter((x: any) => x.status === "granted" && !x.expired).length })).catch(() => {});
  };
  useEffect(load, [role, institutionId]);
  useLive((e) => { if (["records", "submission", "conflict", "consent", "rules"].includes(e.type)) load(); }, [role, institutionId]);
  return c;
}

function navFor(role: Role, c: Record<string, number>): { heading?: string; items: NavItem[] }[] {
  const k = (v?: number) => (v ? n(v) : undefined);
  if (role === "institution") return [
    { heading: "Admissions 2026–27", items: [
      { to: "/i", label: "Overview", art: "overview", end: true },
      { to: "/i/students", label: "Students", art: "students", count: k(c.students) },
      { to: "/i/upload", label: "Upload records", art: "upload" },
      { to: "/i/issues", label: "Validation issues", art: "issues", count: k((c.errors ?? 0) + (c.warnings ?? 0)), tone: c.errors ? "bad" : undefined },
      { to: "/i/submit", label: "Submit to AICTE", art: "submit" },
    ] },
    { heading: "Verification", items: [{ to: "/i/records", label: "Verifiable records", art: "records" }, { to: "/i/integration", label: "API and integrations", art: "integration" }, { to: "/i/activity", label: "Activity log", art: "activity" }] },
  ];
  if (role === "aicte") return [
    { heading: "Monitoring", items: [
      { to: "/a", label: "National overview", art: "overview", end: true },
      { to: "/a/institutions", label: "Institutions", art: "institutions", count: k(c.institutions) },
      { to: "/a/review", label: "Awaiting review", art: "submit", count: k(c.review) },
      { to: "/a/duplicates", label: "Duplicate enrolment", art: "duplicates", count: k(c.conflicts), tone: c.conflicts ? "bad" : undefined },
      { to: "/a/reports", label: "Reports", art: "reports" },
    ] },
    { heading: "Registry", items: [{ to: "/a/lookup", label: "Student lookup", art: "lookup" }, { to: "/a/rules", label: "Validation rules", art: "rules" }, { to: "/a/audit", label: "Audit trail", art: "audit" }] },
  ];
  if (role === "verifier") return [{ heading: "Verification", items: [{ to: "/e", label: "Verify a student", art: "verify", end: true }, { to: "/e/requests", label: "Consent requests", art: "requests", count: k(c.granted) }] }];
  return [{ heading: "My records", items: [{ to: "/s", label: "Academic record", art: "me", end: true }, { to: "/s/sharing", label: "Consent and sharing", art: "sharing", count: k(c.pending), tone: c.pending ? "bad" : undefined }, { to: "/s/views", label: "Access history", art: "views" }] }];
}

interface Scope { label: string; name: string }
const ShellCtx = createContext<{ openDrawer: () => void; scope?: Scope }>({ openDrawer: () => {} });

export function Shell({ children, scope }: { children: ReactNode; scope?: Scope }) {
  const { user } = useSession();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const counts = useCounts(user!.role, user!.institution_id);
  useEffect(() => setOpen(false), [loc.pathname]);
  const groups = navFor(user!.role, counts);
  return (
    <ShellCtx.Provider value={{ openDrawer: () => setOpen(true), scope }}>
      <div className="shell with-sidebar">
        {open && <div className="drawer-scrim" onClick={() => setOpen(false)} />}
        <aside className={`sidebar${open ? " open" : ""}`} aria-label="Sections">
          <div className="side-brand"><NavLink to="/" aria-label="Home"><Brand /></NavLink></div>
          {scope && <div className="side-scope"><div className="side-scope-label">{scope.label}</div><div className="side-scope-name">{scope.name}</div></div>}
          <nav className="side-list">
            {groups.map((g, gi) => (
              <div key={gi} style={{ display: "contents" }}>
                {g.heading && <div className="side-heading">{g.heading}</div>}
                {g.items.map((it) => {
                  const G = Icon[ROW_ICON[it.art]];
                  return (
                    <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `side-row${isActive ? " active" : ""}`}>
                      <G size={18} />
                      <span className="side-label">{it.label}</span>
                      {it.count && <span className={`side-count${it.tone ? ` ${it.tone}` : ""}`}>{it.count}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <span><span className="env-badge">Sandbox</span></span>
            <span>Fictional institutions and students for demonstration.</span>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </ShellCtx.Provider>
  );
}

function UserMenu() {
  const { user, signOut } = useSession();
  const nav = useNavigate();
  return (
    <MenuButton className="user-btn" align="right" ariaLabel="Account" label={<>
      <span className="avatar">{initials(user!.name)}</span>
      <span className="who"><b>{user!.name}</b><span>{ROLE_LABEL[user!.role]} · {user!.title}</span></span>
      <Icon.Down size={14} className="tertiary" />
    </>}>
      {(close) => <>
        <div className="menu-header">Signed in as</div>
        <div style={{ padding: "2px 10px 8px", fontSize: 13 }}><b style={{ display: "block" }}>{user!.name}</b><span className="secondary">{user!.email}</span></div>
        <div className="menu-sep" />
        <MenuItem lead={<Icon.Account size={16} />} onClick={() => { close(); nav("/sign-in"); }}>Switch account</MenuItem>
        <MenuItem lead={<Icon.SignOut size={16} />} onClick={() => { close(); signOut(); nav("/"); }}>Sign out</MenuItem>
      </>}
    </MenuButton>
  );
}

/** A page: the top bar with breadcrumb and account, then the title and content. */
export function Page({ title, sub, actions, back, children, bar }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; children: ReactNode; bar?: ReactNode }) {
  const { openDrawer, scope } = useContext(ShellCtx);
  const { live } = useSession();
  const nav = useNavigate();
  useEffect(() => { if (typeof title === "string") document.title = `${title} · APAAR Registry`; }, [title]);
  return (
    <>
      <header className="topbar">
        <button className="btn quiet icon menu-toggle" onClick={openDrawer} aria-label="Open navigation"><Icon.Menu /></button>
        <nav className="crumbs" aria-label="Breadcrumb">
          {scope && !back && <span className="hide-phone">{scope.label}</span>}
          {scope && !back && <span className="sep hide-phone">/</span>}
          {back && <><button className="link-btn" onClick={() => nav(back.to)}>{back.label}</button><span className="sep">/</span></>}
          <b>{title}</b>
        </nav>
        <span className="spacer" />
        {bar}
        <span className={`live${live ? "" : " off"}`}>{live ? "Live" : "Reconnecting"}</span>
        <UserMenu />
      </header>
      <div className="page">
        <div className="page-head">
          <div><h1 className="page-title">{title}</h1>{sub && <p className="page-sub">{sub}</p>}</div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
        {children}
      </div>
    </>
  );
}
