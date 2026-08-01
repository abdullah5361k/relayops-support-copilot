"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/PublicChrome";
import type { DemoIdentity, DemoIdentitySummary, DemoSessionResponse } from "@/lib/contracts";
import { RelayOpsApiError } from "@/lib/contracts";
import { relayOpsService } from "@/lib/service";

export default function DemoPage() {
  const router = useRouter();
  const [identities, setIdentities] = useState<DemoIdentitySummary[]>([]);
  const [session, setSession] = useState<DemoSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<DemoIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const items = await relayOpsService.listDemoIdentities();
      setIdentities(items);
      try { setSession(await relayOpsService.getDemoSession()); }
      catch (cause) {
        if (!(cause instanceof RelayOpsApiError) || cause.status !== 401) throw cause;
        setSession(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The local API is unavailable.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function choose(identity: DemoIdentity) {
    setChoosing(identity); setError(null);
    try {
      await relayOpsService.createDemoSession(identity);
      router.push("/dashboard/overview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the demo session.");
      setChoosing(null);
    }
  }

  return <main className="demo-page"><section className="demo-aside"><Brand inverse /><div><span className="eyebrow" style={{ color: "#8ed8c2" }}>Integrated portfolio demo</span><h1>Step into a calmer service operation.</h1><p>Choose an allowlisted synthetic identity. The local API creates an HttpOnly demo session and derives the tenant on every private request.</p></div><p className="small">All names, businesses, jobs, and figures are fictional.</p></section><section className="demo-main"><div className="signin-card"><span className="eyebrow">Demo sign-in</span><h2>Choose an identity</h2><p className="muted">Switching safely replaces the server-recognized demo session.</p><div className="simulated-label"><b>Demo authentication only.</b> No tenant ID is stored or trusted in the browser. This is not production authentication.</div>
    {session && <div className="callout" style={{ marginBottom: 18 }}><b>Session active for {session.userName}</b><br /><span className="small">{session.organizationName}</span><br /><button className="btn btn-secondary small" style={{ marginTop: 10 }} onClick={() => router.push("/dashboard/overview")}>Continue dashboard</button></div>}
    {error && <div className="error-panel" role="alert"><b>Could not load the local demo</b><p>{error}</p><button className="btn btn-secondary small" onClick={() => void load()}>Retry</button></div>}
    {loading ? <p className="muted" aria-live="polite">Loading demo identities from the API…</p> : identities.length ? identities.map((item) => <button className="tenant-choice" key={item.identity} disabled={choosing !== null} onClick={() => void choose(item.identity)}><span className="tenant-logo">{item.identity === "northstar-owner" ? "NH" : "PP"}</span><span><b>{item.label}</b><small>Allowlisted synthetic owner · HttpOnly session</small></span><span aria-hidden="true">{choosing === item.identity ? "…" : "→"}</span></button>) : !error && <div className="empty-state">No demo identities are currently available.</div>}
    <button className="btn btn-quiet" style={{ marginTop: 18, width: "100%" }} onClick={() => router.push("/")}>← Back to website</button></div></section></main>;
}
