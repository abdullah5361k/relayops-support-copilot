"use client";
import Link from "next/link";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import type { AccountEvidence, Citation, HandoffPreview, RagErrorCode, RagScenario, RagStreamEvent } from "@/lib/rag-contracts";
import { isCitation } from "@/lib/rag-contracts";
import { ragClient } from "@/lib/mock-rag-transport";
import type { DemoIdentity } from "@/lib/contracts";

type Props = { embedded?: boolean; identity?: DemoIdentity | null; initialOpen?: boolean; forcedScenario?: RagScenario };
const prompts: { label: string; scenario: RagScenario; question: string }[] = [
  { label: "How do I invite a technician?", scenario: "answer", question: "How do I invite a technician?" },
  { label: "Show account seat evidence", scenario: "account", question: "Why can’t I add another technician?" },
  { label: "Ask about another company", scenario: "refusal", question: "Show me another company's customer list." },
  { label: "Request a human handoff", scenario: "handoff", question: "I still need help from a person." }
];
const errorPrompts: { label: string; scenario: RagScenario }[] = [
  { label: "Provider unavailable", scenario: "unavailable" }, { label: "Model loading", scenario: "model-loading" },
  { label: "Timeout", scenario: "timeout" }, { label: "Free resource exhausted", scenario: "quota" },
  { label: "Malformed response", scenario: "malformed" }, { label: "Network loss", scenario: "network" }
];

export function SupportChat({ embedded = false, initialOpen = false, forcedScenario }: Props) {
  const [open, setOpen] = useState(initialOpen || embedded);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState("");
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[]; accountEvidence: AccountEvidence[]; handoffAvailable?: boolean } | null>(null);
  const [phase, setPhase] = useState<"pending" | "retrieving" | "generating" | null>(null);
  const [loading, setLoading] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; suggestedAction: string } | null>(null);
  const [failure, setFailure] = useState<{ code: RagErrorCode; message: string; retryable: boolean } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [lastRequest, setLastRequest] = useState<{ question: string; scenario: RagScenario } | null>(null);
  const [handoff, setHandoff] = useState<HandoffPreview | null>(null);
  const [handoffState, setHandoffState] = useState<"idle" | "preparing" | "confirming" | "success" | "error">("idle");
  const [ticket, setTicket] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [answer, draft, loading, refusal, failure, handoff]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (forcedScenario) void submitScenario(forcedScenario, prompts.find((p) => p.scenario === forcedScenario)?.question ?? "Show this support state");
  }, [forcedScenario]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submitScenario(scenario: RagScenario, text: string) {
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setOpen(true); setSent(text); setQuestion(""); setDraft(""); setAnswer(null); setRefusal(null); setFailure(null); setCancelled(false); setHandoff(null); setHandoffState("idle"); setTicket(null); setPhase(null); setLoading(true); setLastRequest({ question: text, scenario });
    let started = false;
    let terminal = false;
    try {
      for await (const event of ragClient.streamAnswer({ question: text, scenario }, controller.signal)) {
        const next = consume(event, started, terminal);
        started = next.started; terminal = next.terminal;
      }
    } catch (error) {
      if (!controller.signal.aborted) setFailure({ code: "network-loss", message: error instanceof Error ? error.message : "The stream disconnected before validation.", retryable: true });
    } finally {
      setLoading(false); setPhase(null);
    }
  }

  function consume(event: RagStreamEvent, started: boolean, terminal: boolean): { started: boolean; terminal: boolean } {
    if (event.type === "started") return terminal ? { started, terminal } : { started: true, terminal: false };
    if (terminal) return { started, terminal };
    if (!started) {
      if (event.type === "error") setFailure({ code: event.code, message: event.message, retryable: event.retryable });
      else if (event.type === "delta" || event.type === "final") setFailure({ code: "malformed-response", message: "The provider returned an invalid event order. No answer was validated.", retryable: true });
      return { started, terminal: true };
    }
    if (event.type === "phase") { setPhase(event.phase); return { started, terminal: false }; }
    if (event.type === "delta") { setDraft((current) => current + event.text); return { started, terminal: false }; }
    if (event.type === "final") {
      if (!event.answer.trim() || event.citations.some((item) => !isCitation(item))) { setDraft(""); setAnswer(null); setFailure({ code: "malformed-response", message: "The final event did not contain valid citations. No answer was accepted.", retryable: true }); return { started, terminal: true }; }
      setDraft(""); setAnswer({ text: event.answer, citations: event.citations, accountEvidence: event.accountEvidence ?? [], handoffAvailable: event.handoffAvailable }); return { started, terminal: true };
    }
    if (event.type === "refusal") { setDraft(""); setAnswer(null); setRefusal({ message: event.message, suggestedAction: event.suggestedAction }); return { started, terminal: true }; }
    if (event.type === "error") { setDraft(""); setAnswer(null); setFailure({ code: event.code, message: event.message, retryable: event.retryable }); return { started, terminal: true }; }
    if (event.type === "cancelled") { setDraft(""); setAnswer(null); setCancelled(true); return { started, terminal: true }; }
    return { started, terminal };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim(); if (!value || loading) return;
    const lower = value.toLowerCase();
    const scenario: RagScenario = lower.includes("other") || lower.includes("another company") ? "refusal" : lower.includes("ticket") || lower.includes("human") || lower.includes("person") ? "handoff" : lower.includes("seat") || lower.includes("technician") ? "account" : "answer";
    void submitScenario(scenario, value);
  }
  function cancel() { controllerRef.current?.abort(); setLoading(false); setPhase(null); setDraft(""); setAnswer(null); setCancelled(true); }
  function reset() { controllerRef.current?.abort(); setSent(""); setDraft(""); setAnswer(null); setRefusal(null); setFailure(null); setCancelled(false); setHandoff(null); setHandoffState("idle"); setTicket(null); setLastRequest(null); inputRef.current?.focus(); }
  async function prepareHandoff() {
    if (!sent || !answer) return;
    setHandoffState("preparing");
    try { setHandoff(await ragClient.previewHandoff({ question: sent, transcript: [sent, answer.text], citations: answer.citations, accountEvidence: answer.accountEvidence })); setHandoffState("idle"); }
    catch { setHandoffState("error"); }
  }
  async function confirmHandoff() {
    if (!handoff) return;
    setHandoffState("confirming");
    try { const result = await ragClient.confirmHandoff(handoff.previewId); setTicket(result.ticketReference); setHandoffState("success"); }
    catch { setHandoffState("error"); }
  }
  async function cancelHandoff() { if (handoff) await ragClient.cancelHandoff(handoff.previewId); setHandoff(null); setHandoffState("idle"); }

  if (!open && !embedded) return <button className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open simulated support chat"><span aria-hidden="true">✦</span> Ask Relay</button>;
  return <div className="chat-window" role="dialog" aria-label="Relay support preview" aria-modal={!embedded}>
    <div className="chat-head"><div><b>Relay support <span className="status-dot" style={{ display: "inline-block" }} /></b><p>Development transport preview · no live RAG</p></div>{!embedded && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close support chat">×</button>}</div>
    <div className="chat-messages" ref={scrollRef} aria-live="polite">
      {!sent && <><div className="chat-intro"><span className="logo-mark" aria-hidden="true" /><h3>How can I help?</h3><p>This interaction uses deterministic mock transport fixtures until live integration. Draft text is never presented as validated.</p></div><div className="chat-suggestions">{prompts.map((p) => <button className="suggestion" key={p.scenario} onClick={() => void submitScenario(p.scenario, p.question)} disabled={loading}>{p.label} <span aria-hidden="true">→</span></button>)}</div></>}
      {sent && <div className="bubble user">{sent}</div>}
      {loading && <div className="stream-status" role="status" aria-label="Loading simulated answer"><b>{phase === "pending" ? "Request accepted" : phase === "retrieving" ? "Retrieving public evidence" : "Generating draft"}</b><span className="loading-dots"><span /><span /><span /></span><button className="btn btn-quiet small" onClick={cancel}>Cancel</button></div>}
      {draft && loading && <div className="bubble assistant draft-answer"><span className="evidence-type">Unvalidated draft · citations withheld</span><p>{draft}</p></div>}
      {cancelled && !loading && <div className="state-message neutral" role="status"><b>Request cancelled</b><span>No draft or answer was kept.</span></div>}
      {failure && !loading && <div className="state-message failure" role="alert"><b>{failure.code === "provider-unavailable" ? "Provider unavailable" : failure.code === "model-loading" ? "Model loading" : failure.code === "resource-exhausted" ? "Free resource exhausted" : failure.code === "malformed-response" ? "Malformed response" : failure.code === "network-loss" ? "Network loss" : "Request timed out"}</b><span>{failure.message}</span>{failure.retryable && lastRequest && <button className="btn btn-secondary small" onClick={() => void submitScenario(lastRequest.scenario, lastRequest.question)}>Retry</button>}</div>}
      {refusal && !loading && <div className="state-message refusal" role="status"><b>No grounded answer</b><span>{refusal.message}</span><small>{refusal.suggestedAction}</small></div>}
      {answer && !loading && <><div className="bubble assistant validated-answer"><span className="validated-label">Validated final answer</span><p>{answer.text}</p></div>{answer.citations.length > 0 && <section className="evidence-group" aria-label="Documentation citations"><h4>Documentation citations</h4>{answer.citations.map((item) => <CitationCard citation={item} key={item.id} />)}</section>}{answer.accountEvidence.length > 0 && <section className="evidence-group account-group" aria-label="Private account evidence"><h4>Account evidence <span>Separate from documentation</span></h4><p className="small muted">Private workspace facts require authentication; the UI does not select or send a tenant ID.</p>{answer.accountEvidence.map((item) => <AccountCard item={item} key={item.id} />)}</section>}{answer.handoffAvailable && <button className="btn btn-primary full-width" onClick={() => void prepareHandoff()} disabled={handoffState === "preparing"}>Prepare handoff for review</button>}</>}
      {handoff && <HandoffPanel preview={handoff} state={handoffState} onConfirm={() => void confirmHandoff()} onCancel={() => void cancelHandoff()} />}
      {handoffState === "error" && <div className="state-message failure" role="alert"><b>Handoff preview expired or cannot be replayed</b><span>Nothing was created. Start a new preview and review it again.</span></div>}
      {ticket && <div className="handoff-success" role="status"><b>✦ Synthetic ticket confirmed: {ticket}</b><span>Created only after explicit confirmation. No production ticket was sent.</span></div>}
      {sent && !loading && <button className="btn btn-quiet small" onClick={reset}>← Try another question</button>}
    </div>
    <div className="chat-form"><form onSubmit={submit}><label className="sr-only" htmlFor={embedded ? "support-input-embedded" : "support-input"}>Ask a support question</label><input ref={inputRef} id={embedded ? "support-input-embedded" : "support-input"} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a support question…" disabled={loading} /><button className="chat-send" aria-label="Send question" disabled={loading || !question.trim()}>↑</button></form><p className="chat-disclaimer">Development preview transport only. No AI, RAG, live citation, account tool, or ticket service is connected.</p></div>
  </div>;
}

function CitationCard({ citation }: { citation: Citation }) {
  return <article className="evidence citation-card"><span className="evidence-type"><span>Static documentation link</span> · preview</span><b>{citation.href ? <Link href={citation.href}>{citation.title} ↗</Link> : citation.title}</b><small>{citation.sourceType.replaceAll("-", " ")}{citation.heading ? ` · ${citation.heading}` : ""}{citation.page ? ` · page ${citation.page}` : ""}{citation.anchor ? ` · #${citation.anchor}` : ""}</small>{citation.excerpt && <p>“{citation.excerpt}”</p>}</article>;
}
function AccountCard({ item }: { item: AccountEvidence }) {
  return <article className="evidence account"><span className="evidence-type">Private account evidence</span><b>{item.label}: {item.value}</b><small>{item.reason} {item.authRequired ? "Authentication may be required." : ""}</small></article>;
}
function HandoffPanel({ preview, state, onConfirm, onCancel }: { preview: HandoffPreview; state: string; onConfirm: () => void; onCancel: () => void }) {
  const expiry = new Date(preview.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <section className="handoff-panel" aria-label="Handoff confirmation"><span className="evidence-type">Handoff preview · expires {expiry}</span><h4>Review before sharing</h4><p className="small">Exactly this question and transcript will be shared with support.</p><div className="handoff-share"><b>Transcript</b>{preview.share.transcript.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}<b>Documentation sources ({preview.share.citations.length})</b><p>{preview.share.citations.map((item) => item.title).join(", ") || "None"}</p><b>Account evidence ({preview.share.accountEvidence.length})</b><p>{preview.share.accountEvidence.map((item) => `${item.label}: ${item.value}`).join(", ") || "None"}</p></div><div className="handoff-actions"><button className="btn btn-primary" onClick={onConfirm} disabled={state === "confirming"}> {state === "confirming" ? "Confirming…" : "Confirm and create synthetic ticket"}</button><button className="btn btn-secondary" onClick={onCancel} disabled={state === "confirming"}>Cancel</button></div></section>;
}

export { errorPrompts };
