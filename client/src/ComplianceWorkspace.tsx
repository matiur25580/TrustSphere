import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, FileCheck2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import "./ComplianceWorkspace.css";

type Control = {
  id: string; title: string; objective: string; domain: string;
  mappings: { framework: string; reference: string }[];
  implementation: { status: "not_started" | "in_progress" | "implemented" | "not_applicable"; owner: string; notes: string; evidence: unknown[] };
};
type EvidenceEvent = { _id: string; action: string; occurredAt: string; actorId: string };
type Evidence = { _id: string; controlId: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; status: "pending_review" | "approved" | "rejected" | "expired"; expiresAt?: string | null; reviewComment?: string };
type Summary = { total: number; not_started: number; in_progress: number; implemented: number; not_applicable: number; coveragePercent: number; mappedFrameworks: number };
const labels = { not_started: "Not started", in_progress: "In progress", implemented: "Implemented", not_applicable: "Not applicable" };

export function ComplianceWorkspace({ accessToken, organizationId, canWrite, canReview }: { accessToken: string; organizationId: string; canWrite: boolean; canReview: boolean }) {
  const [controls, setControls] = useState<Control[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [framework, setFramework] = useState("all");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState({ status: "not_started" as Control["implementation"]["status"], owner: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [historyEvidenceId, setHistoryEvidenceId] = useState("");
  const [evidenceEvents, setEvidenceEvents] = useState<EvidenceEvent[]>([]);

  async function load() {
    setLoading(true); setError("");
    try {
      const headers = { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId };
      const [controlResponse, summaryResponse] = await Promise.all([
        fetch(`/api/v1/compliance/controls${framework === "all" ? "" : `?framework=${framework}`}`, { headers }),
        fetch("/api/v1/compliance/summary", { headers }),
      ]);
      const controlPayload = await controlResponse.json();
      const summaryPayload = await summaryResponse.json();
      if (!controlResponse.ok) throw new Error(controlPayload.error?.message || "Unable to load compliance controls.");
      if (!summaryResponse.ok) throw new Error(summaryPayload.error?.message || "Unable to load compliance summary.");
      const records = (controlPayload.data ?? []) as Control[];
      setControls(records); setSummary(summaryPayload.data);
      const active = records.find(item => item.id === selected) ?? records[0];
      if (active) { setSelected(active.id); setDraft({ status: active.implementation.status, owner: active.implementation.owner || "", notes: active.implementation.notes || "" }); }
      else setSelected("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load compliance data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [accessToken, organizationId, framework]);

  useEffect(() => {
    if (!selected) { setEvidence([]); return; }
    let active = true;
    fetch(`/api/v1/compliance/evidence?controlId=${encodeURIComponent(selected)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
    }).then(response => response.json().then(payload => ({ response, payload }))).then(({ response, payload }) => {
      if (!response.ok) throw new Error(payload.error?.message || "Unable to load evidence.");
      if (active) setEvidence(payload.data ?? []);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load evidence."); });
    return () => { active = false; };
  }, [selected, accessToken, organizationId]);

  function choose(control: Control) {
    setSelected(control.id);
    setDraft({ status: control.implementation.status, owner: control.implementation.owner || "", notes: control.implementation.notes || "" });
    setNotice("");
  }

  async function save() {
    if (!selected || !canWrite) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/compliance/controls/${selected}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId, "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Unable to save control implementation.");
      setNotice("Control implementation saved.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save control implementation."); }
    finally { setSaving(false); }
  }

  async function uploadEvidence() {
    if (!selected || !selectedFile || !canWrite) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      body.append("controlId", selected);
      if (expiresAt) body.append("expiresAt", new Date(expiresAt).toISOString());
      const response = await fetch("/api/v1/compliance/evidence", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Evidence upload failed.");
      setSelectedFile(null); setExpiresAt(""); setNotice("Evidence uploaded and queued for independent review.");
      const refreshed = await fetch(`/api/v1/compliance/evidence?controlId=${encodeURIComponent(selected)}`, { headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId } });
      const result = await refreshed.json(); if (refreshed.ok) setEvidence(result.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evidence upload failed."); }
    finally { setUploading(false); }
  }

  async function reviewEvidence(item: Evidence, decision: "approved" | "rejected") {
    const comment = window.prompt(`Optional reviewer comment for ${decision}:`) ?? "";
    try {
      const response = await fetch(`/api/v1/compliance/evidence/${item._id}/review`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId, "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Evidence review failed.");
      setEvidence(items => items.map(entry => entry._id === item._id ? payload.data : entry));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evidence review failed."); }
  }

  async function toggleEvidenceHistory(item: Evidence) {
    if (historyEvidenceId === item._id) { setHistoryEvidenceId(""); setEvidenceEvents([]); return; }
    try {
      const response = await fetch(`/api/v1/compliance/evidence/${item._id}/events`, { headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Unable to load evidence history.");
      setHistoryEvidenceId(item._id); setEvidenceEvents(payload.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load evidence history."); }
  }

  async function downloadEvidence(item: Evidence) {
    try {
      const response = await fetch(`/api/v1/compliance/evidence/${item._id}/download`, { headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId } });
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error?.message || "Download failed."); }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = objectUrl; link.download = item.fileName; link.click(); URL.revokeObjectURL(objectUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
  }

  const current = controls.find(item => item.id === selected);
  return <section className="panel compliance-workspace" id="compliance">
    <div className="panel-heading"><div><h2>Compliance control library</h2><p>Map shared controls to frameworks and track organization-level implementation.</p></div><button className="subtle-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="compliance-stats">
      <article><span>Control coverage</span><strong>{summary ? `${summary.coveragePercent}%` : "—"}</strong><small>Implemented / applicable controls</small></article>
      <article><span>Implemented</span><strong>{summary?.implemented ?? "—"}</strong><small>Controls marked implemented</small></article>
      <article><span>In progress</span><strong>{summary?.in_progress ?? "—"}</strong><small>Active implementation work</small></article>
      <article><span>Control library</span><strong>{summary?.total ?? "—"}</strong><small>Across {summary?.mappedFrameworks ?? 2} starter frameworks</small></article>
    </div>
    <div className="compliance-toolbar"><label>Framework<select value={framework} onChange={event => setFramework(event.target.value)}><option value="all">All mapped frameworks</option><option value="soc2">SOC 2</option><option value="iso27001-2022">ISO 27001:2022</option></select></label><span><ShieldCheck size={14}/> Tenant-scoped control records</span></div>
    {error && <p className="compliance-message error" role="alert">{error}</p>}
    {notice && <p className="compliance-message success" role="status">{notice}</p>}
    {loading ? <p className="compliance-empty">Loading control library...</p> : controls.length === 0 ? <p className="compliance-empty">No controls found for this framework.</p> : <div className="compliance-layout">
      <div className="compliance-control-list" aria-label="Controls">
        {controls.map(control => <button type="button" key={control.id} className={selected === control.id ? "compliance-control selected" : "compliance-control"} onClick={() => choose(control)}>
          <span className={`compliance-status-dot ${control.implementation.status}`}/><span><strong>{control.title}</strong><small>{control.domain}</small><small>{control.mappings.map(mapping => `${mapping.framework}: ${mapping.reference}`).join(" · ")}</small></span>
        </button>)}
      </div>
      {current && <div className="compliance-editor">
        <div className="compliance-editor-heading"><span><FileCheck2 size={18}/>{current.domain}</span><h3>{current.title}</h3><p>{current.objective}</p></div>
        <div className="compliance-mappings"><strong>Framework mappings</strong>{current.mappings.map(mapping => <span key={mapping.framework}><b>{mapping.framework}</b>{mapping.reference}</span>)}</div>
        <label>Implementation status<select disabled={!canWrite} value={draft.status} onChange={event => setDraft(value => ({ ...value, status: event.target.value as typeof value.status }))}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Control owner<input disabled={!canWrite} maxLength={120} value={draft.owner} onChange={event => setDraft(value => ({ ...value, owner: event.target.value }))} placeholder="Team or accountable owner"/></label>
        <label>Implementation notes<textarea disabled={!canWrite} rows={4} maxLength={3000} value={draft.notes} onChange={event => setDraft(value => ({ ...value, notes: event.target.value }))} placeholder="Describe the implementation, operating cadence and known gaps..."/></label>
        {canWrite && <button className="primary-button" disabled={saving} onClick={() => void save()}><Save size={15}/>{saving ? "Saving..." : "Save implementation"}</button>}
        <div className="evidence-panel">
          <div><h4>Evidence & review</h4><p>Files are private and require independent review before general member access.</p></div>
          {canWrite && <div className="evidence-upload">
            <label>Choose evidence file<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={event => setSelectedFile(event.target.files?.[0] ?? null)}/></label>
            <label>Expiry date (optional)<input type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)}/></label>
            <button className="primary-button" disabled={!selectedFile || uploading} onClick={() => void uploadEvidence()}>{uploading ? "Uploading..." : "Upload for review"}</button>
          </div>}
          <div className="evidence-list">
            {evidence.length === 0 ? <p>No evidence attached to this control yet.</p> : evidence.map(item => <article key={item._id}>
              <div><strong>{item.fileName}</strong><small>{(item.sizeBytes / 1024).toFixed(1)} KB · {item.mimeType} · {item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : "No expiry date"}</small></div>
              <span className={`evidence-state ${item.status}`}>{item.status.replace("_", " ")}</span>
              {item.status === "approved" && <button type="button" className="subtle-button" onClick={() => void downloadEvidence(item)}>Download</button>}
              {canReview && item.status === "pending_review" && <><button type="button" className="subtle-button" onClick={() => void reviewEvidence(item, "approved")}>Approve</button><button type="button" className="subtle-button" onClick={() => void reviewEvidence(item, "rejected")}>Reject</button></>}
              <button type="button" className="subtle-button" onClick={() => void toggleEvidenceHistory(item)}>{historyEvidenceId === item._id ? "Hide history" : "History"}</button>
              {item.reviewComment && <small className="evidence-review-comment">Reviewer: {item.reviewComment}</small>}
              {historyEvidenceId === item._id && <div className="evidence-history">{evidenceEvents.map((event, index) => <small key={event._id || index}>{event.action.replace("_", " ")} · {new Date(event.occurredAt).toLocaleString()}</small>)}</div>}
            </article>)}
          </div>
        </div>

        {!canWrite && <p className="compliance-readonly"><CircleDashed size={14}/> Read-only access for this workspace role.</p>}
      </div>}
    </div>}
    <p className="compliance-disclaimer"><CheckCircle2 size={13}/> Starter reference crosswalk only. Mappings and coverage do not establish certification, audit readiness or legal compliance.</p>
  </section>;
}
