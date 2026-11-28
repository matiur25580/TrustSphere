import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, FilePlus2, LoaderCircle, Pencil, RefreshCw, Save, X } from "lucide-react";
import "./SavedReportsPanel.css";

type SavedReport = {
  _id: string;
  name: string;
  description: string;
  range: "7d" | "30d" | "90d";
  format: "csv" | "pdf";
  recipients: string[];
  schedule: { frequency: "manual" | "weekly" | "monthly"; dayOfWeek: number | null; dayOfMonth: number | null; localTime: string; timeZone: string };
  enabled: boolean;
  updatedAt: string;
};

type Draft = { name: string; description: string; range: "7d" | "30d" | "90d"; format: "csv" | "pdf"; recipients: string };
const emptyDraft: Draft = { name: "", description: "", range: "30d", format: "csv", recipients: "" };

export function SavedReportsPanel({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const [items, setItems] = useState<SavedReport[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headers = { Authorization: `Bearer ${accessToken}`, "x-organization-id": organizationId, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/reports/saved", { headers });
      const payload = await response.json() as { data?: SavedReport[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Unable to load saved reports.");
      setItems(payload.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load saved reports.");
    } finally { setLoading(false); }
  }, [accessToken, organizationId]);

  useEffect(() => { void load(); }, [load]);

  function startEdit(item: SavedReport) {
    setEditingId(item._id);
    setDraft({ name: item.name, description: item.description ?? "", range: item.range, format: item.format, recipients: item.recipients.join(", ") });
    setNotice(""); setError("");
  }

  function resetForm() { setEditingId(null); setDraft(emptyDraft); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const recipients = [...new Set(draft.recipients.split(",").map(value => value.trim().toLowerCase()).filter(Boolean))];
    try {
      const response = await fetch(editingId ? `/api/v1/reports/saved/${editingId}` : "/api/v1/reports/saved", {
        method: editingId ? "PATCH" : "POST", headers,
        body: JSON.stringify({ name: draft.name.trim(), description: draft.description.trim(), range: draft.range, format: draft.format, recipients, schedule: { frequency: "manual", dayOfWeek: null, dayOfMonth: null, timeZone: "UTC" }, enabled: true }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Unable to save this report definition.");
      resetForm(); setNotice(editingId ? "Saved report updated." : "Saved report created."); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this report definition.");
    } finally { setSaving(false); }
  }

  async function archive(item: SavedReport) {
    if (!window.confirm(`Archive "${item.name}"? It will disappear from the active saved reports list.`)) return;
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/reports/saved/${item._id}`, { method: "DELETE", headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(payload.error?.message || "Unable to archive this report.");
      }
      setItems(current => current.filter(value => value._id !== item._id));
      if (editingId === item._id) resetForm();
      setNotice("Saved report archived.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to archive this report."); }
  }

  return <section className="saved-reports-panel" aria-labelledby="saved-reports-title">
    <div className="saved-reports-heading">
      <div><p className="reports-eyebrow">REPORT LIBRARY</p><h3 id="saved-reports-title">Saved report definitions</h3><p>Keep reusable report configurations for this organization.</p></div>
      <button type="button" className="report-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </div>
    {error && <p className="saved-report-message error" role="alert">{error}</p>}
    {notice && <p className="saved-report-message success" role="status">{notice}</p>}
    <div className="saved-reports-layout">
      <div className="saved-report-list">
        {loading ? <p className="report-empty"><LoaderCircle size={14}/> Loading saved reports…</p> : items.length === 0 ? <p className="report-empty">No saved reports yet. Create a definition to reuse a report configuration.</p> : items.map(item => <article className="saved-report-item" key={item._id}>
          <div className="saved-report-item-copy"><strong>{item.name}</strong><p>{item.description || "No description provided."}</p><small>{item.range} · {item.format.toUpperCase()} · {item.recipients.length} recipient(s) · Updated {new Date(item.updatedAt).toLocaleDateString()}</small></div>
          <div className="saved-report-item-actions"><button type="button" aria-label={`Edit ${item.name}`} onClick={() => startEdit(item)}><Pencil size={14}/></button><button type="button" aria-label={`Archive ${item.name}`} onClick={() => void archive(item)}><Archive size={14}/></button></div>
        </article>)}
      </div>
      <form className="saved-report-form" onSubmit={submit}>
        <div className="saved-report-form-heading"><h4>{editingId ? "Edit definition" : "New definition"}</h4>{editingId && <button type="button" onClick={resetForm} aria-label="Cancel editing"><X size={15}/></button>}</div>
        <label>Report name<input required minLength={2} maxLength={100} value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder="e.g. Monthly vendor risk review"/></label>
        <label>Description<textarea maxLength={500} rows={2} value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} placeholder="What is this report used for?"/></label>
        <div className="saved-report-form-row"><label>Date range<select value={draft.range} onChange={event => setDraft(value => ({ ...value, range: event.target.value as Draft["range"] }))}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label><label>Format<select value={draft.format} onChange={event => setDraft(value => ({ ...value, format: event.target.value as Draft["format"] }))}><option value="csv">CSV</option><option value="pdf">PDF</option></select></label></div>
        <label>Recipients <span>(comma-separated, max 10)</span><input value={draft.recipients} onChange={event => setDraft(value => ({ ...value, recipients: event.target.value }))} placeholder="risk@example.com, audit@example.com"/></label>
        <p className="saved-report-schedule-note">Delivery scheduling is not active in this release. Definitions are stored as configuration only; no email is sent.</p>
        <button className="report-button report-primary saved-report-submit" type="submit" disabled={saving}>{saving ? <LoaderCircle size={14}/> : editingId ? <Save size={14}/> : <FilePlus2 size={14}/>} {saving ? "Saving…" : editingId ? "Save changes" : "Create saved report"}</button>
      </form>
    </div>
  </section>;
}
