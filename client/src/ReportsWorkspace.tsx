import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock3, Download, FileText, RefreshCw, ShieldCheck, Users } from "lucide-react";
import "./ReportsWorkspace.css";
import { SavedReportsPanel } from "./SavedReportsPanel";

type Range = "7d" | "30d" | "90d";
type Distribution = { label: string; count: number };
type Trend = { date: string; vendors: number; assessments: number; findings: number };
type ReportData = {
  meta: { range: Range; startDate: string; endDate: string; generatedAt: string };
  summary: {
    vendorsCreated: number; activeVendorsCreated: number; highRiskVendors: number; averageVendorRisk: number | null;
    assessmentsCreated: number; assessmentsInProgress: number; assessmentsAwaitingReview: number; assessmentsApproved: number; averageAssessmentRisk: number | null;
    findingsCreated: number; openFindings: number; overdueFindings: number; criticalFindings: number; resolvedFindings: number; acceptedFindings: number;
    controlCoveragePercent: number; controlsImplemented: number; controlsInProgress: number; controlsNotStarted: number; controlsNotApplicable: number; totalControls: number;
    evidencePendingReview: number; evidenceApproved: number; evidenceRejected: number; evidenceExpired: number; evidenceExpiringSoon: number;
  };
  distributions: { vendorRisk: Distribution[]; assessmentRisk: Distribution[]; findingSeverity: Distribution[]; findingStatus: Distribution[]; controlStatus: Distribution[]; evidenceStatus: Distribution[] };
  trend: Trend[];
  attention: {
    overdueFindings: Array<{ id: string; title: string; severity: string; priority: string; status: string; dueDate: string; vendorName: string }>;
    assessmentsAwaitingReview: Array<{ id: string; title: string; submittedAt: string; vendorName: string }>;
    evidenceAwaitingReview: Array<{ id: string; fileName: string; controlId: string; createdAt: string }>;
  };
};

function DistributionList({ title, items }: { title: string; items: Distribution[] }) {
  const maximum = Math.max(1, ...items.map(item => item.count));
  return <article className="report-panel">
    <h3>{title}</h3>
    {items.length === 0 ? <p className="report-empty">No records in this period.</p> : <div className="report-bars">{items.map(item => <div className="report-bar-row" key={item.label}>
      <span>{item.label.replace(/_/g, " ")}</span><div><i style={{ width: `${Math.max(item.count ? 3 : 0, item.count / maximum * 100)}%` }}/></div><strong>{item.count}</strong>
    </div>)}</div>}
  </article>;
}

export function ReportsWorkspace({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const [range, setRange] = useState<Range>("30d");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/reports/overview?range=${range}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Unable to load portfolio analytics.");
      setReport(payload.data as ReportData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load portfolio analytics."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [accessToken, organizationId, range]);

  async function exportCsv() {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/v1/reports/export.csv?range=${range}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
      });
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error?.message || "CSV export failed."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `trustsphere-risk-report-${range}.csv`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV export failed."); }
    finally { setExporting(false); }
  }

  const summary = report?.summary;
  const trendMaximum = Math.max(1, ...(report?.trend.map(item => item.vendors + item.assessments + item.findings) ?? [1]));
  return <section className="reports-workspace" id="reports">
    <div className="reports-heading">
      <div><p className="reports-eyebrow">ENTERPRISE INTELLIGENCE</p><h2>Risk intelligence & reporting</h2><p>Live tenant-scoped portfolio metrics, control coverage and operational attention.</p></div>
      <div className="reports-actions">
        <label><CalendarDays size={15}/><select aria-label="Report date range" value={range} onChange={event => setRange(event.target.value as Range)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label>
        <button type="button" className="report-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="report-button" onClick={() => void exportCsv()} disabled={exporting || loading}><Download size={14}/>{exporting ? "Exporting…" : "Export CSV"}</button>
        <button type="button" className="report-button report-primary" onClick={() => window.print()} disabled={!report}><FileText size={14}/> Print / PDF</button>
      </div>
    </div>
    {error && <p className="report-error" role="alert">{error}</p>}
    {loading && !report ? <div className="report-loading">Loading organization analytics…</div> : report && summary ? <>
      <div className="report-meta"><span><i/> Live database report</span><span>Period: {new Date(report.meta.startDate).toLocaleDateString()} – {new Date(report.meta.endDate).toLocaleDateString()}</span><span>Generated {new Date(report.meta.generatedAt).toLocaleString()}</span></div>
      <div className="report-kpis">
        <article><span><Users size={15}/> Vendors created</span><strong>{summary.vendorsCreated}</strong><small>{summary.activeVendorsCreated} active · {summary.highRiskVendors} high / critical · avg risk {summary.averageVendorRisk ?? "—"}</small></article>
        <article><span><ShieldCheck size={15}/> Control coverage</span><strong>{summary.controlCoveragePercent}%</strong><small>{summary.controlsImplemented} of {summary.totalControls - summary.controlsNotApplicable} applicable controls</small></article>
        <article><span><Activity size={15}/> Assessments</span><strong>{summary.assessmentsCreated}</strong><small>{summary.assessmentsInProgress} in progress · {summary.assessmentsAwaitingReview} awaiting review · avg risk {summary.averageAssessmentRisk ?? "—"}</small></article>
        <article><span><AlertTriangle size={15}/> Open findings</span><strong>{summary.openFindings}</strong><small>{summary.overdueFindings} overdue · {summary.criticalFindings} critical</small></article>
        <article><span><Clock3 size={15}/> Evidence review</span><strong>{summary.evidencePendingReview}</strong><small>{summary.evidenceExpiringSoon} expiring within 30 days · {summary.evidenceExpired} expired</small></article>
        <article><span><CheckCircle2 size={15}/> Remediation resolved</span><strong>{summary.resolvedFindings}</strong><small>{summary.acceptedFindings} residual risks accepted</small></article>
      </div>
      <div className="report-section-heading"><div><h3>Risk & control distribution</h3><p>Breakdown of records created during the selected period; compliance and evidence reflect current status.</p></div></div>
      <div className="report-distribution-grid">
        <DistributionList title="Vendor risk bands" items={report.distributions.vendorRisk}/>
        <DistributionList title="Assessment risk bands" items={report.distributions.assessmentRisk}/>
        <DistributionList title="Finding severity" items={report.distributions.findingSeverity}/>
        <DistributionList title="Finding lifecycle" items={report.distributions.findingStatus}/>
        <DistributionList title="Compliance implementation" items={report.distributions.controlStatus}/>
        <DistributionList title="Evidence lifecycle" items={report.distributions.evidenceStatus}/>
      </div>
      <article className="report-panel report-trend-panel">
        <div className="report-panel-heading"><div><h3>Daily portfolio activity</h3><p>New vendors, assessments and findings per day</p></div><BarChart3 size={18}/></div>
        {report.trend.length === 0 ? <p className="report-empty">No activity recorded in this period.</p> : <div className="report-trend-list">{report.trend.map(item => {
          const total = item.vendors + item.assessments + item.findings;
          return <div className="report-trend-row" key={item.date}><time>{new Date(item.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><div><i style={{ width: `${total / trendMaximum * 100}%` }}/></div><strong>{total}</strong><small>V {item.vendors} · A {item.assessments} · F {item.findings}</small></div>;
        })}</div>}
      </article>
      <div className="report-section-heading"><div><h3>Needs attention</h3><p>Current operational queues across this organization.</p></div></div>
      <div className="report-attention-grid">
        <article className="report-panel"><h3>Overdue remediation</h3>{report.attention.overdueFindings.length ? report.attention.overdueFindings.map(item => <div className="report-attention-item" key={item.id}><span><strong>{item.title}</strong><small>{item.vendorName} · {item.priority.toUpperCase()} · {item.severity}</small></span><time>{new Date(item.dueDate).toLocaleDateString()}</time></div>) : <p className="report-empty">No overdue findings.</p>}</article>
        <article className="report-panel"><h3>Assessments awaiting review</h3>{report.attention.assessmentsAwaitingReview.length ? report.attention.assessmentsAwaitingReview.map(item => <div className="report-attention-item" key={item.id}><span><strong>{item.title}</strong><small>{item.vendorName}</small></span><time>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "Submitted"}</time></div>) : <p className="report-empty">No assessments awaiting review.</p>}</article>
        <article className="report-panel"><h3>Evidence awaiting review</h3>{report.attention.evidenceAwaitingReview.length ? report.attention.evidenceAwaitingReview.map(item => <div className="report-attention-item" key={item.id}><span><strong>{item.fileName}</strong><small>{item.controlId}</small></span><time>{new Date(item.createdAt).toLocaleDateString()}</time></div>) : <p className="report-empty">No evidence awaiting review.</p>}</article>
      </div>
      <p className="report-disclaimer">Risk scores and control mappings are internal decision-support indicators, not certifications, audit opinions or regulatory determinations. Date-range filters apply to newly created vendors, assessments and findings; compliance and evidence cards show current organization status.</p>
    </> : <div className="report-loading">No analytics available.</div>}
    <SavedReportsPanel accessToken={accessToken} organizationId={organizationId}/>
  </section>;
}
