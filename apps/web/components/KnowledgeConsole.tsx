"use client";
import React, { useEffect, useState } from "react";
import type { KnowledgeRun, KnowledgeSearchHit, KnowledgeSnapshot } from "@/lib/rag-contracts";
import { ragClient } from "@/lib/mock-rag-transport";

export function KnowledgeConsole() {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void load(); }, []);
  async function load() { setLoading(true); try { setSnapshot(await ragClient.getKnowledge()); } finally { setLoading(false); } }
  async function search(event: React.FormEvent) { event.preventDefault(); if (!query.trim()) { setHits([]); return; } setSearching(true); try { setHits(await ragClient.searchKnowledge(query)); } finally { setSearching(false); } }
  async function reindex(sourceId: string) { setReindexing(sourceId); setMessage("Mock re-index run queued; no source was changed."); try { const run = await ragClient.reindexKnowledge(sourceId); setSnapshot((current) => current ? { ...current, runs: [run, ...current.runs] } : current); } finally { setReindexing(null); } }
  if (loading) return <div className="panel knowledge-loading" role="status">Loading Knowledge preview…</div>;
  if (!snapshot) return <div className="error-panel" role="alert">Knowledge preview could not be loaded. <button className="btn btn-secondary" onClick={() => void load()}>Retry</button></div>;
  const active = snapshot.sources.filter((source) => source.status === "active");
  return <div className="knowledge-console">
    <div className="simulated-label"><b>Development mock transport.</b> This lifecycle is live-ready UI only: deterministic fixtures represent sources, versions, runs, search evidence, and model/cache status. No ingestion or re-indexing occurs.</div>
    {message && <div className="inline-success" role="status">{message}</div>}
    <div className="knowledge-summary-grid"><div className="metric-card"><span className="metric-label">Active sources</span><span className="metric-value">{active.length}</span><span className="metric-note">Previous versions remain inspectable</span></div><div className="metric-card"><span className="metric-label">Latest run</span><span className="metric-value">{snapshot.runs[0]?.stage ?? "—"}</span><span className="metric-note">Server lifecycle placeholder</span></div><div className="metric-card"><span className="metric-label">Model/cache</span><span className="metric-value">{snapshot.model.status}</span><span className="metric-note">{snapshot.model.cache} · honest preview status</span></div></div>
    <div className="knowledge-grid">
      <section className="panel"><div className="panel-head"><div><h2>Sources and versions</h2><span className="small muted">Public evidence namespace only</span></div><button className="btn btn-secondary small" onClick={() => void load()}>Refresh</button></div><div className="source-list">{snapshot.sources.map((source) => <article className={`source-row ${selected === source.id ? "selected" : ""}`} key={source.id}><button onClick={() => setSelected(selected === source.id ? null : source.id)} aria-expanded={selected === source.id}><span><b>{source.title}</b><small>{source.version} · {source.status} · {source.chunkCount} chunks</small></span><span aria-hidden="true">{selected === source.id ? "⌃" : "⌄"}</span></button>{selected === source.id && <div className="source-detail"><dl><div><dt>Type</dt><dd>{source.sourceType}</dd></div><div><dt>Origin</dt><dd>{source.origin}</dd></div><div><dt>Updated</dt><dd>{new Date(source.updatedAt).toLocaleDateString()}</dd></div></dl><button className="btn btn-secondary small" onClick={() => void reindex(source.id)} disabled={reindexing === source.id}>{reindexing === source.id ? "Queueing…" : "Re-index source (preview)"}</button></div>}</article>)}</div></section>
      <section className="panel"><div className="panel-head"><div><h2>Ingestion runs</h2><span className="small muted">Stage and failure visibility</span></div></div><div className="run-list">{snapshot.runs.map((run) => <RunRow run={run} key={run.id} />)}</div></section>
    </div>
    <section className="panel model-panel"><div><span className="eyebrow">Model and cache status</span><h2>{snapshot.model.name}</h2><p className="muted">{snapshot.model.note}</p></div><div className="model-status"><span className={`status ${snapshot.model.status}`}>{snapshot.model.status}</span><span className="small">Cache: {snapshot.model.cache}</span></div></section>
    <section className="panel inspector"><div className="panel-head"><div><h2>Chunk and evidence inspector</h2><span className="small muted">Search only committed public fixture evidence</span></div></div><form className="inspector-form" onSubmit={search}><label className="sr-only" htmlFor="knowledge-search">Search evidence chunks</label><input id="knowledge-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chunks, headings, or source text…" /><button className="btn btn-primary" disabled={searching}>{searching ? "Searching…" : "Search"}</button></form>{query && !searching && <div className="search-results" aria-live="polite">{hits.length ? hits.map((hit) => <article className="evidence citation-card" key={`${hit.sourceId}-${hit.heading}`}><span className="evidence-type">Evidence chunk · score {hit.score.toFixed(2)}</span><b>{hit.title} · {hit.heading}</b><p>{hit.chunk}</p><small>{hit.page ? `Page ${hit.page}` : "No page supplied"}{hit.anchor ? ` · #${hit.anchor}` : ""}</small></article>) : <div className="empty-state">No fixture evidence matched this query.</div>}</div>}</section>
  </div>;
}
function RunRow({ run }: { run: KnowledgeRun }) { return <article className="run-row"><div><b>{run.sourceId}</b><small>{new Date(run.startedAt).toLocaleString()} · {run.id}</small></div><span className={`status ${run.status}`}>{run.status} · {run.stage}</span>{run.error && <p role="alert">Failure: {run.error}</p>}</article>; }
