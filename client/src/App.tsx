import { Activity, ArrowUpRight, Bell, Building2, CheckCircle2, ChevronDown, CircleAlert, ClipboardCheck, FileCheck2, LayoutDashboard, Search, Shield, ShieldCheck, Users, Workflow } from "lucide-react";

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

function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark"><Shield size={21}/></span><span>trust<span className="brand-light">sphere</span><small>RISK & COMPLIANCE</small></span></a>
      <div className="workspace-switcher"><span className="workspace-icon"><Building2 size={17}/></span><span><strong>Acme Corporation</strong><small>Enterprise workspace</small></span><ChevronDown size={15}/></div>
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
        <div className="profile"><div className="avatar">MR</div><span><strong>Workspace admin</strong><small>Demo account</small></span><ChevronDown size={15}/></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div><div className="top-actions"><label className="search-box"><Search size={16}/><input aria-label="Search workspace" placeholder="Search anything..."/><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">MR</div></div></header>
      <section className="page-heading" id="overview"><div><p className="eyebrow">DEMO WORKSPACE · SAMPLE DATA</p><h1>Risk & compliance overview <span>✦</span></h1><p className="subtitle">A clear view of vendor exposure, assessments, and compliance activity.</p></div><button className="primary-button"><ArrowUpRight size={16}/> Generate report</button></section>
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
      <footer className="footer"><span>© 2026 TrustSphere · Portfolio demo</span><span><i className="pulse-dot"/> API integration pending · Sample data only</span></footer>
    </main>
  </div>;
}
export default App;
