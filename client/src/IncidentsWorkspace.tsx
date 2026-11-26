import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Plus, RefreshCw, Save, ShieldAlert, UserRound } from "lucide-react";
import "./IncidentsWorkspace.css";

type Status = "reported" | "triaged" | "investigating" | "contained" | "recovering" | "resolved" | "closed";
type Incident = {
  _id: string; title: string; summary: string; category: string; severity: "p1" | "p2" | "p3" | "p4";
  status: Status; source: string; impact: string; rootCause: string; containmentPlan: string; recoveryPlan: string; lessonsLearned: string;
  vendorId: { _id: string; name: string } | null; findingId: { _id: string; title: string } | null;
  assignedTo: { _id: string; name: string; email: string } | null; reportedAt: string; detectedAt: string | null;
  events?: Array<{ _id: string; action: string; occurredAt: string; details?: { comment?: string }; actorId?: { name?: string } }>;
};
type Option = { _id: string; name?: string; title?: string };
const statuses: Status[] = ["reported", "triaged", "investigating", "contained", "recovering", "resolved", "closed"];
const categories = ["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"];
const blank = { title: "", summary: "", category: "unauthorized_access", severity: "p3", source: "internal", vendorId: "", findingId: "", assignedTo: "", impact: "" };

export function IncidentsWorkspace({ accessToken, organizationId, canWrite, canReview }: { accessToken: string; organizationId: string; canWrite: boolean; canReview: boolean }) {
  const [items, setItems] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [findings, setFindings] = useState<Option[]>([]);
  const [form, setForm] = useState(blank);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headers = { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId, "Content-Type": "application/json" };
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const payload = await response.json().catch(() => ({})) as { data?: any; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "The request could not be completed.");
    return payload.data;
  };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = `/api/v1/incidents?limit=50${statusFilter ? `&status=${statusFilter}` : ""}${severityFilter ? `&severity=${severityFilter}` : ""}`;
      const [incidentData, vendorData, findingData] = await Promise.all([
        request(query), request("/api/v1/vendors?limit=50"), request("/api/v1/findings?limit=50"),
      ]);
      setItems(incidentData as Incident[]);
      setVendors(vendorData as Option[]);
      setFindings(findingData as Option[]);
      if (selected) {
        try { const detail = await request(`/api/v1/incidents/${selected._id}`); setSelected(detail as Incident); }
        catch { setSelected(null); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load incidents."); }
    finally { setLoading(false); }
  }, [accessToken, organizationId, statusFilter, severityFilter, selected?._id]);

  useEffect(() => { void load(); }, [load]);

  async function createIncident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const created = await request("/api/v1/incidents", { method: "POST", body: JSON.stringify(form) });
      setForm(blank); setShowCreate(false); setSelected(created as Incident); setNotice("Incident reported successfully."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create incident."); }
    finally { setBusy(false); }
  }
  async function updateDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data.entries());
    try {
      await request(`/api/v1/incidents/${selected._id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice("Investigation details saved."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save incident."); }
    finally { setBusy(false); }
  }
  async function transition(action: string) {
    if (!selected) return; setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/incidents/${selected._id}/transition`, { method: "POST", body: JSON.stringify({ action }) });
      setNotice(`Incident moved to ${action.replace("_", " ")}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update incident."); }
    finally { setBusy(false); }
  }
  async function addComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError("");
    try {
      await request(`/api/v1/incidents/${selected._id}/comments`, { method: "POST", body: JSON.stringify({ comment }) });
      setComment(""); setNotice("Investigation note added."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add note."); }
    finally { setBusy(false); }
  }

  const active = items.filter(item => !["resolved", "closed"].includes(item.status)).length;
  const p1 = items.filter(item => item.severity === "p1" && !["resolved", "closed"].includes(item.status)).length;
  const actionFor: Partial<Record<Status, Array<{ action: string; label: string }>>> = {
    reported: [{ action: "triage", label: "Triage incident" }, { action: "investigate", label: "Start investigation" }],
    triaged: [{ action: "investigate", label: "Start investigation" }, { action: "contain", label: "Mark contained" }],
    investigating: [{ action: "contain", label: "Mark contained" }],
    contained: [{ action: "recover", label: "Begin recovery" }, { action: "resolve", label: "Resolve incident" }],
    recovering: [{ action: "resolve", label: "Resolve incident" }],
    resolved: canReview ? [{ action: "close", label: "Close incident" }, { action: "reopen", label: "Reopen" }] : [],
    closed: canReview ? [{ action: "reopen", label: "Reopen" }] : [],
  };

  return <section className="incidents-workspace" id="incidents">
    <div className="incidents-heading"><div><p className="incidents-eyebrow">SECURITY OPERATIONS</p><h2>Incident management</h2><p>Report, investigate, contain and recover from security events.</p></div><div className="incidents-actions"><button className="incident-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>{canWrite && <button className="incident-primary" onClick={() => { setSelected(null); setShowCreate(value => !value); }}><Plus size={15}/> Report incident</button>}</div></div>
    <div className="incident-kpis"><article><span><ShieldAlert size={15}/> Active incidents</span><strong>{active}</strong></article><article><span><AlertTriangle size={15}/> P1 critical</span><strong>{p1}</strong></article><article><span><Clock3 size={15}/> Investigating</span><strong>{items.filter(item => item.status === "investigating").length}</strong></article><article><span><CheckCircle2 size={15}/> Resolved / closed</span><strong>{items.filter(item => ["resolved", "closed"].includes(item.status)).length}</strong></article></div>
    {error && <p className="incident-error" role="alert">{error}</p>}{notice && <p className="incident-notice" role="status">{notice}</p>}
    {showCreate && <form className="incident-panel incident-create" onSubmit={createIncident}>
      <div className="incident-panel-title"><h3>Report a security incident</h3><button type="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
      <div className="incident-form-grid"><label>Incident title<input required minLength={4} maxLength={180} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Suspicious privileged account activity"/></label><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(item => <option key={item} value={item}>{item.replace(/_/g," ")}</option>)}</select></label><label>Severity<select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}><option value="p1">P1 · Critical</option><option value="p2">P2 · High</option><option value="p3">P3 · Medium</option><option value="p4">P4 · Low</option></select></label><label>Source<select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}><option value="internal">Internal</option><option value="vendor">Vendor</option><option value="customer">Customer</option><option value="automated">Automated</option><option value="other">Other</option></select></label><label>Related vendor<select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })}><option value="">No vendor linked</option>{vendors.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label><label>Related finding<select value={form.findingId} onChange={e => setForm({ ...form, findingId: e.target.value })}><option value="">No finding linked</option>{findings.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label><label>Assign to (member ID)<input value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="Optional user ID"/></label><label>Impact summary<input value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value })} maxLength={3000} placeholder="Known or suspected impact"/></label><label className="incident-wide">Description<textarea required minLength={10} maxLength={4000} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="What happened, when was it detected, and what systems may be affected?"/></label></div>
      <button className="incident-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Create incident"}</button>
    </form>}
    <div className="incident-filters"><label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status.replace(/_/g," ")}</option>)}</select></label><label>Severity<select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}><option value="">All priorities</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="p4">P4</option></select></label><span>{items.length} incidents loaded</span></div>
    <div className="incident-layout">
      <div className="incident-list">{loading && !items.length ? <p className="incident-empty">Loading incidents…</p> : items.length ? items.map(item => <button type="button" className={selected?._id === item._id ? "incident-list-item selected" : "incident-list-item"} key={item._id} onClick={() => { setShowCreate(false); setSelected(item); }}><span className={`incident-severity ${item.severity}`}>{item.severity.toUpperCase()}</span><span className="incident-list-copy"><strong>{item.title}</strong><small>{item.category.replace(/_/g," ")} · {item.status.replace(/_/g," ")}</small><small>{item.vendorId && typeof item.vendorId === "object" ? item.vendorId.name : "No vendor"} · {new Date(item.reportedAt).toLocaleDateString()}</small></span><span className="incident-chevron">›</span></button>) : <p className="incident-empty">No incidents found. Report your first security event.</p>}</div>
      <div className="incident-detail">
        {!selected ? <div className="incident-empty incident-detail-empty"><ShieldAlert size={28}/><strong>Select an incident</strong><span>Review the investigation, timeline and response actions.</span></div> : <>
          <div className="incident-detail-heading"><div><span className={`incident-severity ${selected.severity}`}>{selected.severity.toUpperCase()}</span><h3>{selected.title}</h3><p>{selected.category.replace(/_/g," ")} · Reported {new Date(selected.reportedAt).toLocaleString()}</p></div><span className="incident-status">{selected.status.replace(/_/g," ")}</span></div>
          <p className="incident-summary">{selected.summary}</p>
          <div className="incident-links"><span>Vendor: <b>{selected.vendorId && typeof selected.vendorId === "object" ? selected.vendorId.name : "—"}</b></span><span>Finding: <b>{selected.findingId && typeof selected.findingId === "object" ? selected.findingId.title : "—"}</b></span><span>Assignee: <b>{selected.assignedTo?.name ?? "Unassigned"}</b></span></div>
          {canWrite && !["resolved","closed"].includes(selected.status) && <form className="incident-edit-form" onSubmit={updateDetails}><h4>Investigation record</h4><label>Impact<input name="impact" defaultValue={selected.impact}/></label><label>Root cause<input name="rootCause" defaultValue={selected.rootCause}/></label><label>Containment plan<textarea name="containmentPlan" defaultValue={selected.containmentPlan}/></label><label>Recovery plan<textarea name="recoveryPlan" defaultValue={selected.recoveryPlan}/></label><label>Lessons learned<textarea name="lessonsLearned" defaultValue={selected.lessonsLearned}/></label><button className="incident-secondary" disabled={busy}><Save size={14}/> Save investigation</button></form>}
          {canWrite && (actionFor[selected.status] ?? []).length > 0 && <div className="incident-transition-actions">{(actionFor[selected.status] ?? []).map(item => <button key={item.action} className={item.action === "close" ? "incident-secondary" : "incident-primary"} disabled={busy} onClick={() => void transition(item.action)}>{item.label}</button>)}</div>}
          {canWrite && selected.status !== "closed" && <form className="incident-comment-form" onSubmit={addComment}><input value={comment} onChange={e => setComment(e.target.value)} minLength={2} maxLength={2000} placeholder="Add an investigation note…" required/><button className="incident-secondary" disabled={busy}>Add note</button></form>}
          <div className="incident-history"><h4>Investigation timeline</h4>{selected.events?.length ? selected.events.map(event => <div className="incident-event" key={event._id}><i/><span><strong>{event.action.replace(/_/g," ")}</strong><small>{event.actorId?.name ?? "Workspace member"} · {new Date(event.occurredAt).toLocaleString()}</small>{event.details?.comment && <p>{event.details.comment}</p>}</span></div>) : <p className="incident-empty">No activity recorded.</p>}</div>
        </>}
      </div>
    </div>
    <p className="incident-disclaimer">Operational incident records support internal response coordination. This workspace does not replace a formal incident response plan, legal review, or statutory breach-notification obligations.</p>
  </section>;
}
