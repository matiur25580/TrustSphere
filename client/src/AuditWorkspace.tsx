import { useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import "./AuditWorkspace.css";

type AuditEvent = {
  id: string;
  resourceType: "assessment" | "finding" | "incident" | "control" | "evidence";
  resourceId: string;
  action: string;
  actor: { id: string; name: string; email: string };
  occurredAt: string;
  details: Record<string, unknown>;
};
type AuditPayload = { data?: AuditEvent[]; meta?: { page: number; limit: number; total: number; totalPages: number }; error?: { message?: string } };

const resourceLabels: Record<AuditEvent["resourceType"], string> = {
  assessment: "Assessment", finding: "Finding", incident: "Incident", control: "Control", evidence: "Evidence",
};

export function AuditWorkspace({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (resourceType) params.set("resourceType", resourceType);
      if (action.trim()) params.set("action", action.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59.999").toISOString());
      try {
        const response = await fetch(`/api/v1/audit/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId },
          signal: controller.signal,
        });
        const payload = await response.json() as AuditPayload;
        if (!response.ok) throw new Error(payload.error?.message || "Unable to load audit events.");
        setItems(payload.data ?? []);
        setTotal(payload.meta?.total ?? 0);
        setTotalPages(payload.meta?.totalPages ?? 0);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Unable to load audit events.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, organizationId, resourceType, action, from, to, page]);

  function resetFilters() {
    setResourceType(""); setAction(""); setFrom(""); setTo(""); setPage(1);
  }

  return <section className="panel audit-workspace" id="activity">
    <div className="panel-heading">
      <div><h2>Audit activity</h2><p>Search tenant-scoped events across assessments, findings, incidents and compliance evidence.</p></div>
      <span className="audit-secure-label"><ShieldCheck size={14}/> Organization scoped</span>
    </div>
    <div className="audit-filters">
      <label>Resource<select value={resourceType} onChange={event => { setResourceType(event.target.value); setPage(1); }}>
        <option value="">All resources</option><option value="assessment">Assessments</option><option value="finding">Findings</option><option value="incident">Incidents</option><option value="control">Controls</option><option value="evidence">Evidence</option>
      </select></label>
      <label>Action<input value={action} onChange={event => { setAction(event.target.value); setPage(1); }} placeholder="e.g. submitted, approved"/></label>
      <label>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }}/></label>
      <label>To<input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }}/></label>
      <button type="button" className="subtle-button" onClick={resetFilters}>Clear filters</button>
    </div>
    {error && <p className="audit-message error" role="alert">{error}</p>}
    <div className="audit-list-heading"><span><Activity size={15}/> {total.toLocaleString()} events</span><button className="subtle-button" type="button" onClick={() => setPage(1)} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    {loading ? <p className="audit-empty">Loading audit events…</p> : items.length === 0 ? <p className="audit-empty">No events match these filters.</p> : <div className="audit-event-list">
      {items.map(item => <article className="audit-event" key={`${item.resourceType}-${item.id}`}>
        <span className={`audit-event-icon ${item.resourceType}`}><Activity size={16}/></span>
        <div className="audit-event-content">
          <div className="audit-event-title"><strong>{item.action.replaceAll("_", " ")}</strong><span>{resourceLabels[item.resourceType]}</span></div>
          <p>{item.actor.name || "Unknown user"} <small>{item.actor.email ? `· ${item.actor.email}` : ""}</small></p>
          <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
        </div>
        <code title={item.resourceId}>{item.resourceId.slice(-8) || "—"}</code>
      </article>)}
    </div>}
    <div className="audit-pagination"><span>Page {page} of {Math.max(1, totalPages)} · {total.toLocaleString()} total</span><div><button type="button" className="subtle-button" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={15}/> Previous</button><button type="button" className="subtle-button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next <ChevronRight size={15}/></button></div></div>
  </section>;
}
