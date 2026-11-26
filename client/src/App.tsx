import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, Bell, Building2, CheckCircle2, ChevronDown, CircleAlert, ClipboardCheck, Eye, EyeOff, FileCheck2, LayoutDashboard, LockKeyhole, LogOut, Mail, Search, Shield, ShieldCheck, Users, Workflow } from "lucide-react";

const metrics = [
  { label: "Active vendors", value: "128", change: "+8 this month", icon: Building2, tone: "blue" },
  { label: "Assessments in progress", value: "24", change: "7 awaiting review", icon: ClipboardCheck, tone: "violet" },
  { label: "High-risk vendors", value: "09", change: "3 need attention", icon: CircleAlert, tone: "amber" },
  { label: "Control coverage", value: "86%", change: "+4.2% this quarter", icon: ShieldCheck, tone: "green" },
];

const vendors = [
  { name: "Northstar Cloud Services", category: "Cloud infrastructure", score: 82, status: "Review required", initials: "NC", color: "blue" },
  { name: "Meridian Payment Systems", category: "Payment processing", score: 34, status: "Approved", initials: "MP", color: "violet" },
  { name: "Apex Data Solutions", category: "Data processing", score: 68, status: "In assessment", initials: "AD", color: "green" },
  { name: "Vertex IT Partners", category: "Managed IT services", score: 21, status: "Approved", initials: "VI", color: "orange" },
];

type HealthState = "checking" | "online" | "offline";
type UserProfile = { id: string; name: string; email: string };
type OrganizationProfile = { id: string; name: string; slug: string; role: string };
type AuthSession = { accessToken: string; user: UserProfile; organizations: OrganizationProfile[] };
type AuthMode = "login" | "register";

let refreshRequest: Promise<string | null> | null = null;
function refreshAccessToken(): Promise<string | null> {
  if (!refreshRequest) {
    refreshRequest = fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
      .then(async response => {
        if (!response.ok) return null;
        const payload = await response.json() as { data?: { accessToken: string } };
        return payload.data?.accessToken ?? null;
      })
      .catch(() => null)
      .finally(() => { refreshRequest = null; });
  }
  return refreshRequest;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mode === "register" ? { name, email, password, organizationName } : { email, password }),
      });
      const payload = await response.json() as { data?: { accessToken: string; user: UserProfile; organization?: OrganizationProfile; organizations?: OrganizationProfile[] }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to authenticate. Please try again.");
      const organizations = payload.data.organizations ?? (payload.data.organization ? [payload.data.organization] : []);
      if (!organizations.length) throw new Error("Your account has no active organization. Please contact an administrator.");
      onAuthenticated({ accessToken: payload.data.accessToken, user: payload.data.user, organizations });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-decoration auth-decoration-one"/><div className="auth-decoration auth-decoration-two"/>
    <section className="auth-card">
      <a className="brand auth-brand" href="/"><span className="brand-mark"><Shield size={21}/></span><span>trust<span className="brand-light">sphere</span><small>RISK & COMPLIANCE</small></span></a>
      <div className="auth-intro"><span className="auth-kicker"><LockKeyhole size={13}/> SECURE ENTERPRISE WORKSPACE</span><h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1><p>{mode === "login" ? "Sign in to continue managing risk with confidence." : "Set up your organization and bring your risk operations together."}</p></div>
      <div className="auth-tabs"><button type="button" className={mode === "login" ? "auth-tab selected" : "auth-tab"} onClick={() => { setMode("login"); setError(""); }}>Sign in</button><button type="button" className={mode === "register" ? "auth-tab selected" : "auth-tab"} onClick={() => { setMode("register"); setError(""); }}>Create account</button></div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <><label>Full name<div className="auth-input"><Users size={16}/><input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex Morgan" minLength={2} maxLength={100} required/></div></label><label>Organization name<div className="auth-input"><Building2 size={16}/><input autoComplete="organization" value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="e.g. Acme Corporation" minLength={2} maxLength={120} required/></div></label></>}
        <label>Work email<div className="auth-input"><Mail size={16}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" maxLength={254} required/></div></label>
        <label>Password<div className="auth-input"><LockKeyhole size={16}/><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"} minLength={mode === "register" ? 12 : 1} maxLength={128} required/><button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>{mode === "register" && <small className="field-hint">Use at least 12 characters for a stronger password.</small>}</label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in to TrustSphere" : "Create secure workspace"}<ArrowUpRight size={16}/></button>
      </form>
      <div className="auth-assurance"><ShieldCheck size={15}/><span>Your session is protected with secure authentication.</span></div>
      <p className="auth-legal">By continuing, you agree to use this portfolio demonstration responsibly. Do not enter confidential business data.</p>
    </section>
    <p className="auth-footer">© 2026 TrustSphere · Enterprise risk, made clearer.</p>
  </main>;
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationProfile | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function restoreSession() {
      try {
        const accessToken = await refreshAccessToken();
        if (!accessToken) return;
        const me = await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal });
        if (!me.ok) return;
        const mePayload = await me.json() as { data: { user: UserProfile; organizations: OrganizationProfile[] } };
        if (!mePayload.data.organizations.length) return;
        const restored = { accessToken, user: mePayload.data.user, organizations: mePayload.data.organizations };
        setSession(restored);
        setActiveOrganization(restored.organizations[0]);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("Session restore failed.");
      } finally {
        if (!controller.signal.aborted) setRestoring(false);
      }
    }
    void restoreSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(async () => {
      try {
        const nextAccessToken = await refreshAccessToken();
        if (!nextAccessToken) {
          setSession(null);
          setActiveOrganization(null);
          return;
        }
        setSession(current => current ? { ...current, accessToken: nextAccessToken } : null);
      } catch {
        // A transient network failure does not immediately destroy the current in-memory session.
      }
    }, 12 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [session?.user.id]);

  function handleAuthenticated(next: AuthSession) {
    setSession(next);
    setActiveOrganization(next.organizations[0]);
  }

  async function handleLogout() {
    try { await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }); } catch { /* Local sign-out still clears the in-memory session. */ }
    setSession(null);
    setActiveOrganization(null);
  }

  if (restoring) return <main className="auth-loading"><span className="loading-mark"><Shield size={22}/></span><strong>TrustSphere</strong><span>Securing your workspace...</span></main>;
  if (!session || !activeOrganization) return <AuthScreen onAuthenticated={handleAuthenticated}/>;
  return <Dashboard user={session.user} organization={activeOrganization} organizations={session.organizations} accessToken={session.accessToken} onLogout={handleLogout} onOrganizationChange={setActiveOrganization}/>;
}

function Dashboard({ user, organization, organizations, accessToken, onLogout, onOrganizationChange }: { user: UserProfile; organization: OrganizationProfile; organizations: OrganizationProfile[]; accessToken: string; onLogout: () => void; onOrganizationChange: (organization: OrganizationProfile) => void }) {
  const [apiState, setApiState] = useState<HealthState>("checking");
  const [tenantState, setTenantState] = useState<"checking" | "verified" | "denied">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json() as Promise<{ status: string }>;
      })
      .then((payload) => setApiState(payload.status === "ok" ? "online" : "offline"))
      .catch(() => setApiState("offline"));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/tenant/context", { headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organization.id }, signal: controller.signal })
      .then(response => setTenantState(response.ok ? "verified" : "denied"))
      .catch(() => setTenantState("denied"));
    return () => controller.abort();
  }, [accessToken, organization.id]);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark"><Shield size={21}/></span><span>trust<span className="brand-light">sphere</span><small>RISK & COMPLIANCE</small></span></a>
      <div className="workspace-switcher"><span className="workspace-icon"><Building2 size={17}/></span><span><strong>{organization.name}</strong><small>{organization.role} workspace</small></span><ChevronDown size={15}/></div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="nav-list">
        <a className="nav-item active" href="#overview"><LayoutDashboard size={17}/>Overview</a>
        <a className="nav-item" href="#vendors"><Users size={17}/>Vendors<span className="nav-count">128</span></a>
        <a className="nav-item" href="#assessments"><ClipboardCheck size={17}/>Assessments</a>
        <a className="nav-item" href="#compliance"><FileCheck2 size={17}/>Compliance</a>
        <a className="nav-item" href="#workflows"><Workflow size={17}/>Workflows</a>
        <a className="nav-item" href="#activity"><Activity size={17}/>Activity</a>
      </nav>
      <div className="sidebar-bottom">
        <div className="security-note"><ShieldCheck size={17}/><span><strong>Security posture</strong><small>Workspace overview</small></span><i className="pulse-dot"/></div>
        <div className="profile"><div className="avatar">{user.name.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</div><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="logout-button" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15}/></button></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">{organization.name} <span>/</span> <strong>Overview</strong></div><div className="top-actions">{organizations.length > 1 && <select className="organization-select" aria-label="Switch organization" value={organization.id} onChange={event => { const next = organizations.find(item => item.id === event.target.value); if (next) onOrganizationChange(next); }}><option value="" disabled>Workspace</option>{organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<label className="search-box"><Search size={16}/><input aria-label="Search workspace" placeholder="Search anything..."/><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">{user.name.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</div></div></header>
      <section className="page-heading" id="overview"><div><p className="eyebrow">{organization.name.toUpperCase()} · {tenantState === "verified" ? "TENANT VERIFIED" : tenantState === "checking" ? "VERIFYING ACCESS" : "ACCESS CHECK FAILED"} · SAMPLE DATA</p><h1>Risk & compliance overview <span>✦</span></h1><p className="subtitle">A clear view of vendor exposure, assessments, and compliance activity.</p></div><button className="primary-button"><ArrowUpRight size={16}/> Generate report</button></section>
      <section className="metric-grid" aria-label="Key metrics">{metrics.map(({label,value,change,icon:Icon,tone})=><article className="metric-card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={18}/></span></div><strong className="metric-value">{value}</strong><span className="metric-change">{change}</span></article>)}</section>
      <section className="content-grid">
        <article className="panel"><div className="panel-heading"><div><h2>Risk exposure</h2><p>Vendor risk distribution across your portfolio</p></div><button className="subtle-button">Last 30 days <ChevronDown size={14}/></button></div><div className="risk-summary"><div className="donut"><div><strong>128</strong><span>Total vendors</span></div></div><div className="legend"><span><i className="dot critical"/>Critical <strong>9</strong></span><span><i className="dot high"/>High <strong>18</strong></span><span><i className="dot medium"/>Medium <strong>42</strong></span><span><i className="dot low"/>Low <strong>59</strong></span></div></div><div className="panel-foot"><span><Activity size={15}/> Illustrative sample data</span><a href="#vendors">View vendors <ArrowUpRight size={14}/></a></div></article>
        <article className="panel"><div className="panel-heading"><div><h2>Needs your attention</h2><p>Items requiring a decision or follow-up</p></div><span className="attention-count">4</span></div>
          <div className="action-item"><span className="action-icon amber"><CircleAlert size={17}/></span><span><strong>Vendor review overdue</strong><small>Northstar Cloud Services · 3 days</small></span><ArrowUpRight size={15}/></div>
          <div className="action-item"><span className="action-icon violet"><FileCheck2 size={17}/></span><span><strong>Evidence awaiting approval</strong><small>ISO 27001 control A.5.19 · 1 day</small></span><ArrowUpRight size={15}/></div>
          <div className="action-item"><span className="action-icon blue"><ClipboardCheck size={17}/></span><span><strong>Assessment needs review</strong><small>Apex Data Solutions · 2 days</small></span><ArrowUpRight size={15}/></div>
          <div className="action-item"><span className="action-icon green"><CheckCircle2 size={17}/></span><span><strong>Remediation update</strong><small>Quarterly access review · Today</small></span><ArrowUpRight size={15}/></div>
        </article>
      </section>
      <section className="panel vendor-panel" id="vendors"><div className="panel-heading"><div><h2>Vendor risk overview</h2><p>Monitor the latest assessments and vendor status</p></div><button className="subtle-button">View directory <ArrowUpRight size={14}/></button></div><div className="table-wrap"><table><thead><tr><th>VENDOR</th><th>CATEGORY</th><th>RISK SCORE</th><th>STATUS</th><th/></tr></thead><tbody>{vendors.map(v=><tr key={v.name}><td><div className="vendor-name"><span className={`vendor-avatar ${v.color}`}>{v.initials}</span><strong>{v.name}</strong></div></td><td>{v.category}</td><td><span className={`score ${v.score>=75?"danger":v.score>=50?"warning":"safe"}`}>{v.score}<small>/100</small></span></td><td><span className={`status ${v.status==="Approved"?"approved":v.status==="In assessment"?"progress":"review"}`}>{v.status}</span></td><td><button className="row-more" aria-label={`More actions for ${v.name}`}>···</button></td></tr>)}</tbody></table></div><div className="table-footer">Showing 4 sample vendors <a href="#vendors">Open vendor directory <ArrowUpRight size={14}/></a></div></section>
      <footer className="footer"><span>© 2026 TrustSphere · Portfolio demo</span><span><i className={apiState === "online" ? "pulse-dot" : "pulse-dot offline"}/> API {apiState === "checking" ? "checking" : apiState} · Tenant {tenantState} · Sample data only</span></footer>
    </main>
  </div>;
}
export default App;
