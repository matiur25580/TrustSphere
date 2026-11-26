import { useEffect, useState, type FormEvent } from "react";
import { FindingsWorkspace } from "./FindingsWorkspace";
import { ComplianceWorkspace } from "./ComplianceWorkspace";
import { ReportsWorkspace } from "./ReportsWorkspace";
import { AlertTriangle, Activity, ArrowUpRight, Bell, Building2, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Eye, EyeOff, FileCheck2, LayoutDashboard, LockKeyhole, LogOut, Mail, Pencil, Plus, Search, Shield, ShieldCheck, Trash2, Users, Workflow, X } from "lucide-react";



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


type VendorRecord = {
  _id: string;
  name: string;
  website: string;
  category: string;
  description: string;
  contactName: string;
  contactEmail: string;
  criticality: "low" | "medium" | "high" | "critical";
  dataSensitivity: "public" | "internal" | "confidential" | "restricted";
  accessLevel: "none" | "limited" | "privileged";
  status: "onboarding" | "active" | "under_review" | "suspended" | "offboarded";
  riskScore: number;
  riskBand: "low" | "medium" | "high" | "critical";
  createdAt: string;
};
type VendorForm = Omit<VendorRecord, "_id" | "riskScore" | "riskBand" | "createdAt">;
const emptyVendorForm: VendorForm = {
  name: "", website: "", category: "", description: "", contactName: "", contactEmail: "",
  criticality: "medium", dataSensitivity: "internal", accessLevel: "limited", status: "onboarding",
};
const statusLabel = (status: VendorRecord["status"]) => ({
  onboarding: "Onboarding", active: "Active", under_review: "Under review", suspended: "Suspended", offboarded: "Offboarded",
}[status]);
const riskLabel = (band: VendorRecord["riskBand"]) => band.charAt(0).toUpperCase() + band.slice(1);

function VendorDirectory({ accessToken, organizationId, canWrite }: { accessToken: string; organizationId: string; canWrite: boolean }) {
  const [items, setItems] = useState<VendorRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [riskBand, setRiskBand] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyVendorForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadVendors() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: "8", sortBy: "createdAt", sortOrder: "desc" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (riskBand) params.set("riskBand", riskBand);
      try {
        const response = await fetch(`/api/v1/vendors?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
          signal: controller.signal,
        });
        const payload = await response.json() as { data?: VendorRecord[]; meta?: { total: number; totalPages: number }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || "Unable to load the vendor directory.");
        setItems(payload.data ?? []);
        setTotal(payload.meta?.total ?? 0);
        setTotalPages(Math.max(1, payload.meta?.totalPages ?? 1));
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to load vendors.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadVendors();
    return () => controller.abort();
  }, [accessToken, organizationId, page, search, status, riskBand, refreshKey]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyVendorForm);
    setEditorOpen(true);
  }
  function openEdit(vendor: VendorRecord) {
    setEditingId(vendor._id);
    setForm({
      name: vendor.name, website: vendor.website || "", category: vendor.category, description: vendor.description || "",
      contactName: vendor.contactName || "", contactEmail: vendor.contactEmail || "", criticality: vendor.criticality,
      dataSensitivity: vendor.dataSensitivity, accessLevel: vendor.accessLevel, status: vendor.status,
    });
    setEditorOpen(true);
  }
  function updateForm<K extends keyof VendorForm>(key: K, value: VendorForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }
  async function saveVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/v1/vendors/${editingId}` : "/api/v1/vendors", {
        method: editingId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Unable to save this vendor.");
      setEditorOpen(false);
      setPage(1);
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this vendor.");
    } finally {
      setSaving(false);
    }
  }
  async function archiveVendor(vendor: VendorRecord) {
    if (!window.confirm(`Archive ${vendor.name}? It will be removed from the active directory.`)) return;
    try {
      const response = await fetch(`/api/v1/vendors/${vendor._id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
      });
      if (!response.ok) throw new Error("Unable to archive this vendor.");
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to archive this vendor.");
    }
  }

  return <section className="panel vendor-panel live-vendor-panel" id="vendors">
    <div className="panel-heading vendor-directory-heading">
      <div><h2>Vendor risk directory</h2><p>Live organization records · tenant-scoped vendor operations</p></div>
      {canWrite && <button className="primary-button vendor-add-button" onClick={openCreate}><Plus size={15}/> Add vendor</button>}
    </div>
    <div className="vendor-toolbar">
      <label className="vendor-search"><Search size={15}/><input aria-label="Search vendors" placeholder="Search name, category or contact..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label>
      <select aria-label="Filter by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="under_review">Under review</option><option value="suspended">Suspended</option><option value="offboarded">Offboarded</option></select>
      <select aria-label="Filter by risk" value={riskBand} onChange={event => { setRiskBand(event.target.value); setPage(1); }}><option value="">All risk levels</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
    </div>
    {error && <div className="vendor-error" role="alert">{error}</div>}
    {editorOpen && <form className="vendor-editor" onSubmit={saveVendor}>
      <div className="vendor-editor-title"><div><strong>{editingId ? "Update vendor profile" : "Register a vendor"}</strong><small>Risk score is calculated automatically from the classification inputs.</small></div><button type="button" className="vendor-icon-button" onClick={() => setEditorOpen(false)} aria-label="Close editor"><X size={17}/></button></div>
      <div className="vendor-form-grid">
        <label>Vendor name *<input required minLength={2} maxLength={160} value={form.name} onChange={event => updateForm("name", event.target.value)} placeholder="e.g. Northstar Cloud Services"/></label>
        <label>Service category *<input required minLength={2} maxLength={80} value={form.category} onChange={event => updateForm("category", event.target.value)} placeholder="Cloud infrastructure"/></label>
        <label>Website<input type="url" value={form.website} onChange={event => updateForm("website", event.target.value)} placeholder="https://vendor.example"/></label>
        <label>Contact name<input value={form.contactName} onChange={event => updateForm("contactName", event.target.value)} placeholder="Primary contact"/></label>
        <label>Contact email<input type="email" value={form.contactEmail} onChange={event => updateForm("contactEmail", event.target.value)} placeholder="security@vendor.example"/></label>
        <label>Criticality<select value={form.criticality} onChange={event => updateForm("criticality", event.target.value as VendorForm["criticality"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Data sensitivity<select value={form.dataSensitivity} onChange={event => updateForm("dataSensitivity", event.target.value as VendorForm["dataSensitivity"])}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
        <label>System access<select value={form.accessLevel} onChange={event => updateForm("accessLevel", event.target.value as VendorForm["accessLevel"])}><option value="none">No access</option><option value="limited">Limited</option><option value="privileged">Privileged</option></select></label>
        <label>Lifecycle status<select value={form.status} onChange={event => updateForm("status", event.target.value as VendorForm["status"])}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="under_review">Under review</option><option value="suspended">Suspended</option><option value="offboarded">Offboarded</option></select></label>
        <label className="vendor-description-field">Description<textarea rows={2} maxLength={2000} value={form.description} onChange={event => updateForm("description", event.target.value)} placeholder="Describe the service and business dependency..."/></label>
      </div>
      <div className="vendor-editor-actions"><button type="button" className="subtle-button" onClick={() => setEditorOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create vendor"}</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>VENDOR</th><th>CATEGORY</th><th>CRITICALITY</th><th>RISK SCORE</th><th>STATUS</th>{canWrite && <th>ACTIONS</th>}</tr></thead>
      <tbody>
        {loading ? <tr><td colSpan={canWrite ? 6 : 5} className="vendor-empty">Loading vendor records...</td></tr>
        : items.length === 0 ? <tr><td colSpan={canWrite ? 6 : 5} className="vendor-empty">No vendors match these filters. Add a vendor to start your directory.</td></tr>
        : items.map(vendor => <tr key={vendor._id}>
          <td><div className="vendor-name"><span className="vendor-avatar blue">{vendor.name.split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase()}</span><span className="vendor-name-copy"><strong>{vendor.name}</strong><small>{vendor.contactEmail || vendor.website || "No contact details"}</small></span></div></td>
          <td>{vendor.category}</td><td><span className={`criticality-tag ${vendor.criticality}`}>{vendor.criticality}</span></td>
          <td><span className={`score ${vendor.riskBand === "critical" || vendor.riskBand === "high" ? "danger" : vendor.riskBand === "medium" ? "warning" : "safe"}`}>{vendor.riskScore}<small>/100 · {riskLabel(vendor.riskBand)}</small></span></td>
          <td><span className={`status ${vendor.status === "active" ? "approved" : vendor.status === "under_review" || vendor.status === "onboarding" ? "progress" : "review"}`}>{statusLabel(vendor.status)}</span></td>
          {canWrite && <td><div className="vendor-row-actions"><button type="button" onClick={() => openEdit(vendor)} aria-label={`Edit ${vendor.name}`} title="Edit vendor"><Pencil size={14}/></button><button type="button" onClick={() => void archiveVendor(vendor)} aria-label={`Archive ${vendor.name}`} title="Archive vendor"><Trash2 size={14}/></button></div></td>}
        </tr>)}
      </tbody>
    </table></div>
    <div className="table-footer"><span>{total === 0 ? "No records" : `Showing ${(page - 1) * 8 + 1}–${Math.min(page * 8, total)} of ${total} vendors`}</span><div className="vendor-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} aria-label="Previous page"><ChevronLeft size={15}/></button><span>Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)} aria-label="Next page"><ChevronRight size={15}/></button></div></div>
    <p className="vendor-scoring-note"><ShieldCheck size={13}/> Risk score v1 is a deterministic portfolio heuristic, not a completed security assessment.</p>
  </section>;
}


type AssessmentQuestion = { id: string; category: string; prompt: string; weight: number; required: boolean };
type AssessmentResponse = { questionId: string; answer: "yes" | "partial" | "no" | "not_applicable"; comment?: string; evidence?: { storageKey: string; fileName: string; mimeType: "application/pdf"; sizeBytes: number; sha256: string }[] };
type AssessmentRecord = {
  _id: string; title: string; status: "draft" | "in_progress" | "submitted" | "approved" | "rejected";
  vendorId: string | { _id: string; name: string; category?: string };
  riskScore: number | null; riskBand: string | null; scoreModelVersion?: string;
  templateSnapshot: { title: string; version: number; questions: AssessmentQuestion[] };
  responses: AssessmentResponse[];
  categoryBreakdown?: { category: string; score: number; answeredWeight: number; totalWeight: number }[];
  reviewerComment?: string;
  events?: { _id: string; action: string; actorId: string; occurredAt: string }[];
};
type VendorOption = { _id: string; name: string; category: string };
type AnswerDraft = { answer: AssessmentResponse["answer"]; comment: string; storageKey: string; fileName: string; sizeBytes: string; sha256: string };
const blankAnswer: AnswerDraft = { answer: "yes", comment: "", storageKey: "", fileName: "", sizeBytes: "", sha256: "" };

function AssessmentWorkspace({ accessToken, organizationId, canWrite, canReview }: { accessToken: string; organizationId: string; canWrite: boolean; canReview: boolean }) {
  const [items, setItems] = useState<AssessmentRecord[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selected, setSelected] = useState<AssessmentRecord | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [vendorId, setVendorId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const headers = { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId };

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [assessmentResponse, vendorResponse] = await Promise.all([
          fetch(`/api/v1/assessments?limit=30${statusFilter ? `&status=${statusFilter}` : ""}`, { headers, signal: controller.signal }),
          fetch("/api/v1/vendors?limit=50", { headers, signal: controller.signal }),
        ]);
        const [assessmentPayload, vendorPayload] = await Promise.all([assessmentResponse.json(), vendorResponse.json()]) as [
          { data?: AssessmentRecord[]; error?: { message?: string } },
          { data?: VendorOption[]; error?: { message?: string } }
        ];
        if (!assessmentResponse.ok) throw new Error(assessmentPayload.error?.message || "Unable to load assessments.");
        if (!vendorResponse.ok) throw new Error(vendorPayload.error?.message || "Unable to load vendors.");
        setItems(assessmentPayload.data ?? []);
        setVendors(vendorPayload.data ?? []);
        if (!vendorId && vendorPayload.data?.[0]) setVendorId(vendorPayload.data[0]._id);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Unable to load assessment workspace.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, organizationId, statusFilter, refreshKey]);

  async function openAssessment(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/assessments/${id}`, { headers });
      const payload = await response.json() as { data?: AssessmentRecord; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to open assessment.");
      setSelected(payload.data);
      const next: Record<string, AnswerDraft> = {};
      for (const answer of payload.data.responses ?? []) {
        const evidence = answer.evidence?.[0];
        next[answer.questionId] = {
          answer: answer.answer, comment: answer.comment ?? "", storageKey: evidence?.storageKey ?? "",
          fileName: evidence?.fileName ?? "", sizeBytes: evidence?.sizeBytes ? String(evidence.sizeBytes) : "", sha256: evidence?.sha256 ?? "",
        };
      }
      setAnswers(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open assessment.");
    } finally {
      setBusy(false);
    }
  }
  async function createAssessment() {
    if (!vendorId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/assessments", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ vendorId }) });
      const payload = await response.json() as { data?: AssessmentRecord; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to create assessment.");
      setRefreshKey(value => value + 1);
      await openAssessment(payload.data._id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create assessment.");
    } finally {
      setBusy(false);
    }
  }
  function updateAnswer(questionId: string, patch: Partial<AnswerDraft>) {
    setAnswers(current => ({ ...current, [questionId]: { ...(current[questionId] ?? blankAnswer), ...patch } }));
  }
  async function saveResponses(submit: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const responses: AssessmentResponse[] = selected.templateSnapshot.questions.map(question => {
        const answer = answers[question.id] ?? blankAnswer;
        if (answer.storageKey.trim() && (!answer.fileName.trim() || !Number.isInteger(Number(answer.sizeBytes)) || Number(answer.sizeBytes) < 1 || !/^[a-f0-9]{64}$/i.test(answer.sha256.trim()))) throw new Error("Complete the evidence filename, byte size and 64-character SHA-256 checksum, or clear the storage key.");
        const evidence = answer.storageKey.trim() ? [{
          storageKey: answer.storageKey.trim(), fileName: answer.fileName.trim(),
          mimeType: "application/pdf" as const, sizeBytes: Number(answer.sizeBytes), sha256: answer.sha256.trim(),
        }] : [];
        return { questionId: question.id, answer: answer.answer, comment: answer.comment, ...(evidence.length ? { evidence } : {}) };
      }).filter(item => Boolean(answers[item.questionId]));
      const saveResponse = await fetch(`/api/v1/assessments/${selected._id}/responses`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ responses }),
      });
      const savedPayload = await saveResponse.json() as { error?: { message?: string } };
      if (!saveResponse.ok) throw new Error(savedPayload.error?.message || "Unable to save responses.");
      if (submit) {
        const submitResponse = await fetch(`/api/v1/assessments/${selected._id}/submit`, { method: "POST", headers });
        const submitPayload = await submitResponse.json() as { error?: { message?: string } };
        if (!submitResponse.ok) throw new Error(submitPayload.error?.message || "Unable to submit assessment.");
      }
      await openAssessment(selected._id);
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save assessment.");
    } finally {
      setBusy(false);
    }
  }
  async function review(decision: "approved" | "rejected") {
    if (!selected) return;
    const comment = window.prompt(`Optional reviewer comment for ${decision}:`) ?? "";
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/assessments/${selected._id}/review`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ decision, comment }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Unable to record review decision.");
      await openAssessment(selected._id);
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review assessment.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel assessment-panel" id="assessments">
    <div className="panel-heading"><div><h2>Vendor security assessments</h2><p>Versioned questionnaires · weighted risk scoring · human review</p></div><span className="assessment-version">Baseline v1</span></div>
    <div className="assessment-toolbar">
      {canWrite && <><select aria-label="Choose vendor for assessment" value={vendorId} onChange={event => setVendorId(event.target.value)}><option value="">Select vendor</option>{vendors.map(vendor => <option key={vendor._id} value={vendor._id}>{vendor.name}</option>)}</select><button className="primary-button" type="button" disabled={!vendorId || busy} onClick={() => void createAssessment()}><Plus size={14}/> New assessment</button></>}
      <select aria-label="Filter assessments by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="in_progress">In progress</option><option value="submitted">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
    </div>
    {error && <div className="vendor-error" role="alert">{error}</div>}
    <div className="assessment-layout">
      <div className="assessment-list">
        {loading ? <p className="assessment-empty">Loading assessments…</p> : items.length === 0 ? <p className="assessment-empty">No assessments yet. Start one from a vendor profile.</p> : items.map(item => {
          const vendorName = typeof item.vendorId === "object" ? item.vendorId.name : "Vendor";
          return <button type="button" key={item._id} className={`assessment-list-item ${selected?._id === item._id ? "selected" : ""}`} onClick={() => void openAssessment(item._id)}>
            <span><strong>{vendorName}</strong><small>{item.title}</small></span><span className={`assessment-status ${item.status}`}>{item.status.replace("_", " ")}</span>
            {item.riskScore !== null && <small className="assessment-list-score">Risk {item.riskScore}/100 · {item.riskBand}</small>}
          </button>;
        })}
      </div>
      <div className="assessment-detail">
        {!selected ? <div className="assessment-empty detail-empty"><ClipboardCheck size={24}/><strong>Select an assessment</strong><span>Questionnaire responses, evidence references and risk breakdown appear here.</span></div> : <>
          <div className="assessment-detail-heading"><div><span className={`assessment-status ${selected.status}`}>{selected.status.replace("_", " ")}</span><h3>{selected.title}</h3><p>{selected.templateSnapshot.title} · Template version {selected.templateSnapshot.version}</p></div><button type="button" className="vendor-icon-button" onClick={() => setSelected(null)} aria-label="Close assessment"><X size={16}/></button></div>
          {selected.riskScore !== null && <div className="assessment-score"><strong>{selected.riskScore}<small>/100</small></strong><span><b>{selected.riskBand?.toUpperCase()} RISK</b><small>Scoring model {selected.scoreModelVersion}</small></span></div>}
          {selected.categoryBreakdown?.length ? <div className="category-breakdown">{selected.categoryBreakdown.map(item => <div key={item.category}><span>{item.category}</span><strong>{item.score}/100</strong><div><i style={{ width: `${item.score}%` }}/></div></div>)}</div> : null}
          <div className="question-list">{selected.templateSnapshot.questions.map((question,index) => {
            const draft = answers[question.id] ?? blankAnswer;
            const locked = !canWrite || !["draft","in_progress"].includes(selected.status);
            return <article className="assessment-question" key={question.id}>
              <div className="question-meta"><span>{question.category}</span><small>Weight {question.weight}{question.required ? " · Required" : ""}</small></div>
              <strong>{index+1}. {question.prompt}</strong>
              <select disabled={locked} value={draft.answer} onChange={event => updateAnswer(question.id,{answer:event.target.value as AnswerDraft["answer"]})}><option value="yes">Yes — implemented</option><option value="partial">Partially implemented</option><option value="no">No — not implemented</option><option value="not_applicable">Not applicable</option></select>
              <textarea disabled={locked} rows={2} value={draft.comment} onChange={event => updateAnswer(question.id,{comment:event.target.value})} placeholder="Add context or remediation notes…"/>
              {!locked && <div className="evidence-reference"><input value={draft.storageKey} onChange={event => updateAnswer(question.id,{storageKey:event.target.value})} placeholder="Private object storage key (optional)"/><input value={draft.fileName} onChange={event => updateAnswer(question.id,{fileName:event.target.value})} placeholder="Evidence filename"/><input inputMode="numeric" value={draft.sizeBytes} onChange={event => updateAnswer(question.id,{sizeBytes:event.target.value})} placeholder="File size in bytes"/><input value={draft.sha256} onChange={event => updateAnswer(question.id,{sha256:event.target.value})} placeholder="SHA-256 checksum (64 hex characters)"/></div>}
              {locked && draft.storageKey && <p className="evidence-readonly">Evidence reference: {draft.fileName} · {draft.sizeBytes} bytes · SHA-256 {draft.sha256.slice(0,12)}…</p>}
            </article>;
          })}</div>
          {selected.reviewerComment && <p className="reviewer-comment"><strong>Reviewer note:</strong> {selected.reviewerComment}</p>}
          {selected.events?.length ? <div className="assessment-history"><strong>Assessment history</strong>{selected.events.map(event => <div key={event._id}><span className="history-marker"/><span><b>{event.action.replace("_"," ")}</b><small>{new Date(event.occurredAt).toLocaleString()}</small></span></div>)}</div> : null}
          {canWrite && ["draft","in_progress"].includes(selected.status) && <div className="assessment-actions"><button className="subtle-button" disabled={busy} onClick={() => void saveResponses(false)}>Save responses</button><button className="primary-button" disabled={busy} onClick={() => void saveResponses(true)}>Submit for review <ArrowUpRight size={14}/></button></div>}
          {canReview && selected.status === "submitted" && <div className="assessment-actions"><button className="subtle-button" disabled={busy} onClick={() => void review("rejected")}>Request changes / Reject</button><button className="primary-button" disabled={busy} onClick={() => void review("approved")}>Approve assessment <CheckCircle2 size={14}/></button></div>}
          <p className="assessment-disclaimer">Decision support only. This questionnaire score is not a certification, audit opinion, or regulatory compliance determination.</p>
        </>}
      </div>
    </div>
  </section>;
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
        <a className="nav-item" href="#vendors"><Users size={17}/>Vendors</a>
        <a className="nav-item" href="#assessments"><ClipboardCheck size={17}/>Assessments</a>
        <a className="nav-item" href="#findings"><AlertTriangle size={17}/>Findings</a>
        <a className="nav-item" href="#compliance"><FileCheck2 size={17}/>Compliance</a>
        <a className="nav-item" href="#reports"><Activity size={17}/>Reports</a>
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
      <section className="page-heading" id="overview"><div><p className="eyebrow">{organization.name.toUpperCase()} · {tenantState === "verified" ? "TENANT VERIFIED" : tenantState === "checking" ? "VERIFYING ACCESS" : "ACCESS CHECK FAILED"} · LIVE TENANT DATA · RISK INTELLIGENCE</p><h1>Risk & compliance overview <span>✦</span></h1><p className="subtitle">A clear view of vendor exposure, assessments, and compliance activity.</p></div><a className="primary-button" href="#reports"><ArrowUpRight size={16}/> Generate report</a></section>
      <VendorDirectory accessToken={accessToken} organizationId={organization.id} canWrite={["owner", "admin", "analyst"].includes(organization.role)}/>
      <AssessmentWorkspace accessToken={accessToken} organizationId={organization.id} canWrite={["owner", "admin", "analyst"].includes(organization.role)} canReview={["owner", "admin"].includes(organization.role)}/>
      <FindingsWorkspace accessToken={accessToken} organizationId={organization.id} canWrite={["owner", "admin", "analyst"].includes(organization.role)} canReview={["owner", "admin"].includes(organization.role)}/>
      <ComplianceWorkspace accessToken={accessToken} organizationId={organization.id} canWrite={["owner", "admin", "analyst"].includes(organization.role)} canReview={["owner", "admin"].includes(organization.role)}/>
      <ReportsWorkspace accessToken={accessToken} organizationId={organization.id}/>
      <footer className="footer"><span>© 2026 TrustSphere · Portfolio demo</span><span><i className={apiState === "online" ? "pulse-dot" : "pulse-dot offline"}/> API {apiState === "checking" ? "checking" : apiState} · Tenant {tenantState} · Live organization reports</span></footer>
    </main>
  </div>;
}
export default App;
