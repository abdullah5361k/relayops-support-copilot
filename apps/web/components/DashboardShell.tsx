"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DemoIdentity, DemoIdentitySummary, DemoSessionResponse, Section, Workspace } from "@/lib/contracts";
import { RelayOpsApiError } from "@/lib/contracts";
import { relayOpsService } from "@/lib/service";
import { Brand } from "./PublicChrome";
import { SupportChat } from "./SupportChat";
import { KnowledgeConsole } from "./KnowledgeConsole";

const nav: { section: Section; label: string; icon: string }[] = [
  { section: "overview", label: "Overview", icon: "⌂" }, { section: "jobs", label: "Jobs", icon: "▣" }, { section: "team", label: "Team", icon: "♙" }, { section: "customers", label: "Customers", icon: "♧" }, { section: "subscription", label: "Subscription", icon: "◫" }, { section: "support", label: "Support tickets", icon: "◌" }, { section: "knowledge", label: "Knowledge", icon: "◇" }
];

export function DashboardShell() {
  const pathname = usePathname(); const router = useRouter();
  const section = (pathname.split("/").pop() || "overview") as Section;
  const [identities, setIdentities] = useState<DemoIdentitySummary[]>([]);
  const [session, setSession] = useState<DemoSessionResponse | null>(null);
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false); const [switcher, setSwitcher] = useState(false); const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const active = await relayOpsService.getDemoSession();
      setSession(active);
      const [workspace, choices] = await Promise.all([relayOpsService.getWorkspace(), relayOpsService.listDemoIdentities()]);
      setData(workspace); setIdentities(choices);
    } catch (cause) {
      if (cause instanceof RelayOpsApiError && cause.status === 401) { router.replace("/demo"); return; }
      setError(cause instanceof Error ? cause.message : "The workspace could not be loaded.");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function switchIdentity(identity: DemoIdentity) {
    if (identity === session?.identity) { setSwitcher(false); return; }
    setSwitching(true); setError(null);
    try { await relayOpsService.createDemoSession(identity); setSwitcher(false); setData(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch the demo identity."); }
    finally { setSwitching(false); }
  }

  async function signOut() {
    setSwitching(true);
    try { await relayOpsService.clearDemoSession(); }
    finally { router.replace("/demo"); }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <main className="route-state"><div className="error-panel" role="alert"><b>Workspace unavailable</b><p>{error}</p><button className="btn btn-primary" onClick={() => void load()}>Retry</button><Link className="btn btn-quiet" href="/demo">Return to demo sign-in</Link></div></main>;
  if (!data || !session) return <Loading />;

  const organization = data.dashboard.organization;
  const orgInitials = organization.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  const userInitials = session.userName.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <div className="dashboard"><div className={`mobile-overlay ${menu ? "open" : ""}`} onClick={() => setMenu(false)} /><aside className={`sidebar ${menu ? "open" : ""}`}><Brand inverse /><div style={{ position: "relative" }}><button className="workspace-switch" onClick={() => setSwitcher(!switcher)} aria-expanded={switcher} disabled={switching}><span className="tenant-logo">{orgInitials}</span><span><b>{organization.name}</b><small>{data.subscription.planName} · Demo</small></span><span aria-hidden="true">⌄</span></button>{switcher && <div className="workspace-menu">{identities.map((item) => <button key={item.identity} onClick={() => void switchIdentity(item.identity)} className="tenant-choice" disabled={switching}><span className="tenant-logo mini">{item.identity === "northstar-owner" ? "NH" : "PP"}</span><span><b>{item.label}</b><small>{item.identity === session.identity ? "Current identity" : "Replace demo session"}</small></span></button>)}</div>}</div><nav className="dash-nav" aria-label="Dashboard navigation">{nav.map((item) => <Link key={item.section} href={`/dashboard/${item.section}`} className={section === item.section ? "active" : ""} onClick={() => setMenu(false)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav><div className="sidebar-bottom"><div className="user-row"><span className="avatar">{userInitials}</span><span><b className="small">{session.userName}</b><small>{session.role.toLowerCase()} · Demo</small></span></div><button className="signout-button" onClick={() => void signOut()} disabled={switching}>Sign out</button></div></aside><main className="dash-main"><header className="dash-top"><div className="top-title"><button className="mobile-menu" onClick={() => setMenu(true)} aria-label="Open navigation">☰</button><b>{nav.find((item) => item.section === section)?.label}</b></div><div className="dash-top-actions"><Link className="btn btn-secondary small" href="/help">Help centre</Link><span className="avatar" title={session.userName}>{userInitials}</span></div></header><div className="demo-banner"><b>LOCAL SYNTHETIC DATA</b> · Private screens are database-backed and scoped by the API demo session. Not production auth.</div>{error && <div className="inline-error" role="alert">Refresh failed: {error} <button onClick={() => void load()}>Retry</button></div>}<div className="dash-content"><SectionView section={section} data={data} session={session} /></div></main></div>;
}

function Loading() { return <main className="route-state"><div style={{ textAlign: "center" }}><span className="logo-mark" style={{ margin: "auto" }} /><p className="muted" aria-live="polite">Loading database-backed workspace…</p></div></main>; }
function Head({ title, description, action }: { title: string; description: string; action?: string }) { return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{action && <button className="btn btn-primary" title="Visual preview only">{action}</button>}</div>; }
function Status({ value }: { value: string }) { const label = value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); return <span className={`status ${label}`}>{label}</span>; }
function EmptyRow({ columns, label }: { columns: number; label: string }) { return <tr><td colSpan={columns}><div className="empty-state">{label}</div></td></tr>; }
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "No service yet";

function SectionView({ section, data, session }: { section: Section; data: Workspace; session: DemoSessionResponse }) {
  const org = data.dashboard.organization;
  if (section === "overview") { const metrics = [{ label: "Open jobs", value: data.dashboard.metrics.openJobs, note: "Scheduled or in progress" }, { label: "Completed jobs", value: data.dashboard.metrics.completedThisMonth, note: "Synthetic seeded history" }, { label: "Active customers", value: data.dashboard.metrics.activeCustomers, note: "Database-backed records" }, { label: "Open tickets", value: data.dashboard.metrics.openTickets, note: "Open or in progress" }]; return <div className="overview-layout"><Head title={`Good morning, ${session.userName.split(" ")[0]}`} description={`Here’s the seeded operational snapshot for ${org.name}.`} action="+ New job (preview)" /><div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><span className="metric-label">{metric.label}</span><span className="metric-value">{metric.value}</span><span className="metric-note">{metric.note}</span></div>)}</div><div className="dash-grid"><div className="panel"><div className="panel-head"><h2>Schedule</h2><Link className="small" href="/dashboard/jobs">View all</Link></div><JobsTable data={data} compact /></div><div className="panel usage-box"><span className="eyebrow">Tenant context</span><h2>{org.name}</h2><p className="muted">{org.trade} · {org.city}</p><p className="small muted">The API derives this workspace from the HttpOnly demo session; the browser does not supply an organization ID.</p></div></div></div>; }
  if (section === "jobs") return <><Head title="Jobs" description={`${data.jobs.length} database-backed jobs scoped to ${org.name}.`} action="+ New job (preview)" /><div className="panel"><div className="panel-head"><h2>Schedule</h2><span className="small muted">Read-only API data</span></div><JobsTable data={data} /></div></>;
  if (section === "team") return <><Head title="Team" description={`Active technicians scoped to ${org.name}.`} action="Invite member (preview)" /><div className="settings-grid"><div className="panel usage-box"><div className="usage-line"><b>Active membership seats</b><b>{data.subscription.seatsUsed} / {data.subscription.seatLimit}</b></div><div className="progress"><span style={{ width: `${Math.min(100, data.subscription.seatsUsed / data.subscription.seatLimit * 100)}%` }} /></div><p className="muted small">Seat usage is counted by the tenant-scoped Subscription API.</p></div><div className="panel usage-box"><b>Demo-session boundary active</b><p className="muted small">Private reads are protected. Invitations and production authorization are not implemented.</p></div></div><div className="panel table-wrap" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Specialty</th><th>Status</th></tr></thead><tbody>{data.members.length ? data.members.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.role}</td><td>{member.specialty}</td><td><Status value="ACTIVE" /></td></tr>) : <EmptyRow columns={4} label="No active technicians for this workspace." />}</tbody></table></div></>;
  if (section === "customers") return <><Head title="Customers" description={`Private customer records returned only for ${org.name}.`} action="+ Add customer (preview)" /><div className="panel table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Address</th><th>Contact</th><th>Last service</th><th>Jobs</th></tr></thead><tbody>{data.customers.length ? data.customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small>{customer.active ? "Active" : "Inactive"}</small></td><td>{customer.address}</td><td>{customer.email ?? customer.phone}<small>{customer.email ? customer.phone : ""}</small></td><td>{date(customer.lastServiceAt)}</td><td>{customer.jobCount}</td></tr>) : <EmptyRow columns={5} label="No customers for this workspace." />}</tbody></table></div></>;
  if (section === "subscription") return <><Head title="Subscription" description="Fictional plan records from the tenant-scoped API; no billing system is connected." /><div className="settings-grid"><div className="panel usage-box"><span className="pill">{data.subscription.status.toLowerCase()}</span><h2>{data.subscription.planName}</h2><p className="muted">${(data.subscription.monthlyCents / 100).toFixed(2)} demo price · started {date(data.subscription.startedAt)}</p><button className="btn btn-secondary">Preview plans</button></div><div className="panel usage-box"><div className="usage-line"><b>Included seats</b><b>{data.subscription.seatsUsed} of {data.subscription.seatLimit}</b></div><div className="progress"><span style={{ width: `${Math.min(100, data.subscription.seatsUsed / data.subscription.seatLimit * 100)}%` }} /></div><p className="muted small">Active memberships are counted server-side for this tenant.</p></div></div><div className="callout"><b>No billing capability.</b> Plans are synthetic records; charges, invoices, payment methods, renewals, and plan changes are not implemented.</div></>;
  if (section === "support") return <SupportScreen data={data} session={session} />;
  return <KnowledgeScreen />;
}

function JobsTable({ data, compact = false }: { data: Workspace; compact?: boolean }) { const jobs = compact ? data.jobs.slice(0, 3) : data.jobs; return <div className="table-wrap"><table className="data-table"><thead><tr><th>Job</th><th>Customer</th><th>Technician</th><th>Scheduled (UTC)</th><th>Status</th></tr></thead><tbody>{jobs.length ? jobs.map((job) => <tr key={job.id}><td><strong>{job.reference}</strong><small>{job.title}</small></td><td>{job.customerName}</td><td>{job.technicianName ?? "Unassigned"}</td><td>{dateTime(job.scheduledFor)}</td><td><Status value={job.status} /></td></tr>) : <EmptyRow columns={5} label="No jobs for this workspace." />}</tbody></table></div>; }
function SupportScreen({ data }: { data: Workspace; session: DemoSessionResponse }) { return <><Head title="Support tickets" description={`Tickets below are synthetic database records for ${data.dashboard.organization.name}. The assistant uses same-origin local APIs and can report honestly when local Qwen is unavailable.`} /><div className="simulated-label"><b>Local integration.</b> Documentation citations are active public evidence. Account facts come only from fixed tenant-safe tools; confirming a handoff creates a synthetic ticket.</div><div className="support-workspace"><div className="full-support"><div className="panel support-console"><SupportChat embedded /></div></div><div className="panel table-wrap support-ticket-list"><div className="panel-head"><h2>Recent support tickets</h2><span className="small muted">Synthetic API data · separate from handoff previews</span></div><table className="data-table"><thead><tr><th>Ticket</th><th>Subject</th><th>Requester</th><th>Status</th><th>Updated (UTC)</th></tr></thead><tbody>{data.tickets.length ? data.tickets.map((ticket) => <tr key={ticket.id}><td><strong>{ticket.reference}</strong></td><td>{ticket.subject}</td><td>{ticket.requesterName}</td><td><Status value={ticket.status} /></td><td>{dateTime(ticket.updatedAt)}</td></tr>) : <EmptyRow columns={5} label="No support tickets for this workspace." />}</tbody></table></div></div></>; }
function KnowledgeScreen() { return <><Head title="Knowledge" description="Inspect committed public sources, active versions, local model/cache health, runs, and evidence search. This owner-only demo view never accepts a path or URL." /><KnowledgeConsole /></>; }
