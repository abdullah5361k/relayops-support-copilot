"use client";
import Link from "next/link";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatReply, ChatScenario, DemoIdentity } from "@/lib/contracts";
import { relayOpsService } from "@/lib/service";

type Props = { embedded?: boolean; identity?: DemoIdentity | null; initialOpen?: boolean; forcedScenario?: ChatScenario };
const prompts: { label: string; scenario: ChatScenario; question: string }[] = [
  { label: "How do I invite a technician?", scenario: "public", question: "How do I invite a technician?" },
  { label: "Preview a seat-limit answer", scenario: "seats", question: "Why can’t I add another technician?" },
  { label: "Show another company’s customers", scenario: "refusal", question: "Show me PrimeFlow’s customer list." },
  { label: "Create a support ticket", scenario: "handoff", question: "I still need help. Create a support ticket." },
];

export function SupportChat({ embedded = false, identity = null, initialOpen = false, forcedScenario }: Props) {
  const [open, setOpen] = useState(initialOpen || embedded);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState("");
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [reply, loading]);
  useEffect(() => { if (forcedScenario) void submitScenario(forcedScenario, prompts.find((p) => p.scenario === forcedScenario)?.question ?? "Show this support state"); }, [forcedScenario]);
  async function submitScenario(scenario: ChatScenario, text: string) {
    setOpen(true); setSent(text); setQuestion(""); setReply(null); setLoading(true);
    const result = await relayOpsService.askSupport(text, identity, scenario);
    setReply(result); setLoading(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim(); if (!value || loading) return;
    const lower = value.toLowerCase();
    const scenario: ChatScenario = lower.includes("other") || lower.includes("primeflow") ? "refusal" : lower.includes("ticket") || lower.includes("human") ? "handoff" : lower.includes("seat") || lower.includes("another technician") ? "seats" : "public";
    void submitScenario(scenario, value);
  }
  if (!open && !embedded) return <button className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open simulated support chat"><span aria-hidden="true">✦</span> Ask Relay</button>;
  return <div className="chat-window" role="dialog" aria-label="Simulated Relay support" aria-modal={!embedded}>
    <div className="chat-head"><div><b>Relay support <span className="status-dot" style={{ display: "inline-block" }} /></b><p>Prewritten states · no live AI</p></div>{!embedded && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close support chat">×</button>}</div>
    <div className="chat-messages" ref={scrollRef} aria-live="polite">
      {!sent && <><div className="chat-intro"><span className="logo-mark" aria-hidden="true" /><h3>How can I help?</h3><p>Try a guided UI scenario. Answers, evidence, refusals, and handoffs are prewritten.</p></div><div className="chat-suggestions">{prompts.map((p) => <button className="suggestion" key={p.scenario} onClick={() => void submitScenario(p.scenario, p.question)}>{p.label} <span aria-hidden="true">→</span></button>)}</div></>}
      {sent && <div className="bubble user">{sent}</div>}
      {loading && <div className="bubble assistant" aria-label="Loading simulated answer"><div className="loading-dots"><span /><span /><span /></div></div>}
      {reply && <><div className="bubble assistant">{reply.answer}{reply.ticketId && <div className="citation">✓ Confirmation: {reply.ticketId}</div>}</div>{reply.evidence.map((item, index) => <div className={`evidence ${item.type}`} key={`${item.label}-${index}`}><span className="evidence-type">{item.type === "account" ? "Illustrative account card" : "Static documentation link"}</span><b>{item.href ? <Link href={item.href}>{item.label} ↗</Link> : item.label}</b><small>{item.detail}</small></div>)}<button className="btn btn-quiet small" onClick={() => { setSent(""); setReply(null); }}>← Try another state</button></>}
    </div>
    <div className="chat-form"><form onSubmit={submit}><label className="sr-only" htmlFor={embedded ? "support-input-embedded" : "support-input"}>Ask a support question</label><input id={embedded ? "support-input-embedded" : "support-input"} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a support question…" disabled={loading} /><button className="chat-send" aria-label="Send question" disabled={loading}>↑</button></form><p className="chat-disclaimer">Static demo only. No AI, RAG, live citation, account tool, or ticket creation is connected.</p></div>
  </div>;
}
