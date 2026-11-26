import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, FileCheck2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import "./ComplianceWorkspace.css";

type Control = {
  id: string; title: string; objective: string; domain: string;
  mappings: { framework: string; reference: string }[];
  implementation: { status: "not_started" | "in_progress" | "implemented" | "not_applicable"; owner: string; notes: string; evidence: unknown[] };
};
type Summary = { total: number; not_started: number; in_progress: number; implemented: number; not_applicable: number; coveragePercent: number; mappedFrameworks: number };
const labels = { not_started: "Not started", in_progress: "In progress", implemented: "Implemented", not_applicable: "Not applicable" };

export function ComplianceWorkspace({ accessToken, organizationId, canWrite }: { accessToken: string; organizationId: string; canWrite: boolean }) {
  const [controls, setControls] = useState<Control[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [framework, setFramework] = useState("all");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState({ status: "not_started" as Control["implementation"]["status"], owner: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
        {!canWrite && <p className="compliance-readonly"><CircleDashed size={14}/> Read-only access for this workspace role.</p>}
      </div>}
    </div>}
    <p className="compliance-disclaimer"><CheckCircle2 size={13}/> Starter reference crosswalk only. Mappings and coverage do not establish certification, audit readiness or legal compliance.</p>
  </section>;
}
