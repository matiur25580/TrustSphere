import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ClipboardList, RefreshCw, Save, ShieldCheck } from "lucide-react";

type FindingStatus = "open" | "in_progress" | "pending_validation" | "resolved" | "accepted";
type Finding = {
  _id: string; title: string; description: string; category: string;
  severity: "low" | "medium" | "high" | "critical"; priority: "p1" | "p2" | "p3" | "p4";
  status: FindingStatus; remediationPlan: string; remediationOwner: string;
  dueDate: string | null; resolutionNote: string; acceptedReason: string;
  sourceAnswer: "no" | "partial"; vendorId: { _id: string; name: string } | string;
  assessmentId: { _id: string; title: string } | string;
  events?: Array<{ _id: string; action: string; occurredAt: string; details?: Record<string, unknown> }>;
  updatedAt?: string;
};
type AssessmentOption = { _id: string; title: string; status: string };

export function FindingsWorkspace({ accessToken, organizationId, canWrite, canReview }: { accessToken: string; organizationId: string; canWrite: boolean; canReview: boolean }) {
  const [items, setItems] = useState<Finding[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [assessmentId, setAssessmentId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ remediationPlan: "", remediationOwner: "", dueDate: "" });

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
      const [findingData, assessmentData] = await Promise.all([
        request(`/api/v1/findings?limit=50${statusFilter ? `&status=${statusFilter}` : ""}${severityFilter ? `&severity=${severityFilter}` : ""}`),
        request("/api/v1/assessments?limit=50"),
      ]);
      setItems(findingData as Finding[]);
      setAssessments((assessmentData as AssessmentOption[]).filter(item => ["submitted", "approved", "rejected"].includes(item.status)));
      if (selected) {
        const refreshed = (findingData as Finding[]).find(item => item._id === selected._id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load findings."); }
    finally { setLoading(false); }
  }, [accessToken, organizationId, statusFilter, severityFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selected) setDraft({
      remediationPlan: selected.remediationPlan ?? "",
      remediationOwner: selected.remediationOwner ?? "",
      dueDate: selected.dueDate ? new Date(selected.dueDate).toISOString().slice(0, 10) : "",
    });
  }, [selected?._id, selected?.updatedAt]);

  async function openFinding(id: string) {
    try { const data = await request(`/api/v1/findings/${id}`); setSelected(data as Finding); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open finding."); }
  }
  async function generate() {
    if (!assessmentId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/v1/findings/from-assessment/${assessmentId}`, { method: "POST" });
      setNotice(`${result.createdCount} new finding(s) generated. Existing findings were left unchanged.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate findings."); }
    finally { setBusy(false); }
  }
  async function saveRemediation() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(`/api/v1/findings/${selected._id}`, {
        method: "PATCH",
        body: JSON.stringify({ remediationPlan: draft.remediationPlan, remediationOwner: draft.remediationOwner, dueDate: draft.dueDate ? new Date(`${draft.dueDate}T23:59:59.000Z`).toISOString() : null }),
      });
      setSelected(data as Finding); setNotice("Remediation details saved."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save remediation."); }
    finally { setBusy(false); }
  }
  async function transition(body: Record<string, string>) {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(`/api/v1/findings/${selected._id}/transition`, { method: "POST", body: JSON.stringify(body) });
      setSelected(data as Finding); setNotice("Finding workflow updated."); await load();
      await openFinding(selected._id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workflow transition failed."); }
    finally { setBusy(false); }
  }
  async function submitForValidation() {
    const note = window.prompt("Describe the remediation completed:");
    if (note && note.trim().length >= 5) await transition({ action: "submit_for_validation", resolutionNote: note.trim() });
  }
  async function acceptResidualRisk() {
    const reason = window.prompt("Explain why this residual risk is accepted:");
    if (reason && reason.trim().length >= 10) await transition({ action: "accept_risk", reason: reason.trim() });
  }
  const vendorName = (item: Finding) => typeof item.vendorId === "string" ? "Vendor" : item.vendorId?.name ?? "Vendor";
  const priorityLabel = (priority: string) => priority.toUpperCase();

  return <section className="panel findings-panel" id="findings">
    <div className="panel-heading findings-heading"><div><h2>Findings & remediation</h2><p>Turn assessment gaps into owned, trackable remediation work</p></div><span className="findings-count"><AlertTriangle size={13}/>{items.length} shown</span></div>
    <div className="findings-toolbar">
      <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="pending_validation">Pending validation</option><option value="resolved">Resolved</option><option value="accepted">Risk accepted</option></select>
      <select aria-label="Filter by severity" value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      {canWrite && <><select aria-label="Assessment to generate from" value={assessmentId} onChange={event => setAssessmentId(event.target.value)}><option value="">Choose submitted assessment…</option>{assessments.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select><button className="primary-button" disabled={!assessmentId || busy} onClick={() => void generate()}><ArrowUpRight size={14}/> Generate findings</button></>}
      <button className="subtle-button" onClick={() => void load()} disabled={loading}><RefreshCw size={13}/> Refresh</button>
    </div>
    {error && <p className="vendor-error" role="alert">{error}</p>}
    {notice && <p className="findings-notice" role="status">{notice}</p>}
    <div className="findings-layout">
      <div className="findings-table-wrap"><table className="findings-table"><thead><tr><th>FINDING</th><th>VENDOR</th><th>SEVERITY</th><th>PRIORITY</th><th>STATUS</th></tr></thead><tbody>
        {items.map(item => <tr key={item._id} className={selected?._id === item._id ? "selected-row" : ""} onClick={() => void openFinding(item._id)}><td><strong>{item.title}</strong><small>{item.category} · {item.sourceAnswer}</small></td><td>{vendorName(item)}</td><td><span className={`finding-severity ${item.severity}`}>{item.severity}</span></td><td><b className={`finding-priority ${item.priority}`}>{priorityLabel(item.priority)}</b></td><td><span className={`finding-status ${item.status}`}>{item.status.replace("_", " ")}</span></td></tr>)}
        {!items.length && <tr><td colSpan={5} className="vendor-empty">{loading ? "Loading findings…" : "No findings match these filters. Generate them from a submitted assessment to get started."}</td></tr>}
      </tbody></table></div>
      <aside className="finding-detail">
        {!selected ? <div className="assessment-empty detail-empty"><ClipboardList size={23}/><strong>Select a finding</strong><span>Review its source, remediation owner, due date and validation history.</span></div> : <>
          <div className="assessment-detail-heading"><div><span className={`finding-status ${selected.status}`}>{selected.status.replace("_", " ")}</span><h3>{selected.title}</h3><p>{selected.category} · {vendorName(selected)} · {priorityLabel(selected.priority)}</p></div></div>
          <p className="finding-description">{selected.description}</p>
          <div className="finding-source">Source response: <strong>{selected.sourceAnswer.toUpperCase()}</strong> · linked assessment</div>
          <div className="finding-form">
            <label>Remediation plan<textarea rows={3} disabled={!canWrite || ["resolved", "accepted"].includes(selected.status)} value={draft.remediationPlan} onChange={event => setDraft(value => ({ ...value, remediationPlan: event.target.value }))} placeholder="Describe the corrective action and expected outcome…"/></label>
            <div className="finding-form-row"><label>Remediation owner<input disabled={!canWrite || ["resolved", "accepted"].includes(selected.status)} value={draft.remediationOwner} onChange={event => setDraft(value => ({ ...value, remediationOwner: event.target.value }))} placeholder="Team or responsible person"/></label><label>Due date<input type="date" disabled={!canWrite || ["resolved", "accepted"].includes(selected.status)} value={draft.dueDate} onChange={event => setDraft(value => ({ ...value, dueDate: event.target.value }))}/></label></div>
            {canWrite && !["resolved", "accepted"].includes(selected.status) && <button className="subtle-button" disabled={busy} onClick={() => void saveRemediation()}><Save size={13}/> Save remediation</button>}
          </div>
          <div className="finding-actions">
            {canWrite && selected.status === "open" && <button className="subtle-button" disabled={busy} onClick={() => void transition({ action: "start" })}>Start work</button>}
            {canWrite && ["open", "in_progress"].includes(selected.status) && <button className="primary-button" disabled={busy} onClick={() => void submitForValidation()}>Submit for validation</button>}
            {canReview && selected.status === "pending_validation" && <><button className="subtle-button" disabled={busy} onClick={() => void transition({ action: "validate", decision: "reopen", comment: window.prompt("What needs more work?") ?? "" })}>Return to remediation</button><button className="primary-button" disabled={busy} onClick={() => void transition({ action: "validate", decision: "resolved", comment: window.prompt("Validation note (optional):") ?? "" })}><ShieldCheck size={13}/> Validate resolution</button></>}
            {canReview && !["resolved", "accepted"].includes(selected.status) && <button className="subtle-button" disabled={busy} onClick={() => void acceptResidualRisk()}>Accept residual risk</button>}
          </div>
          {selected.events?.length ? <div className="assessment-history"><strong>Finding activity</strong>{selected.events.map(entry => <div key={entry._id}><span className="history-marker"/><span><b>{entry.action.replace(/_/g, " ")}</b><small>{new Date(entry.occurredAt).toLocaleString()}</small></span></div>)}</div> : null}
        </>}
      </aside>
    </div>
  </section>;
}
