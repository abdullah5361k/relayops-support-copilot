"use client";
import React, { FormEvent, useEffect, useRef, useState } from 'react';
import type { AccountEvidence, Citation, HandoffPreview, RagErrorCode, RagStreamEvent } from '@/lib/rag-contracts';
import { isCitation } from '@/lib/rag-contracts';
import { relayOpsService } from '@/lib/service';

type Props = { embedded?: boolean; initialOpen?: boolean };
const prompts = [
  { label: 'How do I acknowledge an urgent job?', question: 'How do I acknowledge an urgent job?' },
  { label: 'Show my current seat usage', question: 'Why can’t I add another technician to my current subscription?' },
  { label: 'Ask outside the evidence', question: 'Give me a competitor pricing comparison.' }
];
type Answer = { text: string; citations: Citation[]; accountEvidence: AccountEvidence[]; handoffAvailable: boolean; accountToolPlan: { tool: 'subscription_seat_usage'; arguments: Record<string, never> } | { tool: 'job_status'; arguments: { reference: string } } | { tool: 'support_ticket_status'; arguments: { reference: string } } | null };

export function SupportChat({ embedded = false, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen || embedded); const [question, setQuestion] = useState(''); const [sent, setSent] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null); const [phase, setPhase] = useState<'pending' | 'retrieving' | 'generating' | null>(null); const [loading, setLoading] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null); const [failure, setFailure] = useState<{ code: RagErrorCode; message: string; retryable: boolean } | null>(null); const [cancelled, setCancelled] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null); const [handoff, setHandoff] = useState<HandoffPreview | null>(null); const [handoffState, setHandoffState] = useState<'idle' | 'preparing' | 'confirming' | 'success' | 'error'>('idle'); const [ticket, setTicket] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null); const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]); useEffect(() => () => controllerRef.current?.abort(), []);

  async function ask(text: string) {
    if (loading || !text.trim()) return; controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    setOpen(true); setSent(text); setQuestion(''); setAnswer(null); setRefusal(null); setFailure(null); setCancelled(false); setHandoff(null); setHandoffState('idle'); setTicket(null); setPhase('pending'); setLoading(true); setLastQuestion(text);
    let started = false; let terminal = false;
    try {
      for await (const event of relayOpsService.support.streamAnswer({ question: text }, controller.signal)) {
        const result = consume(event, started, terminal); started = result.started; terminal = result.terminal;
      }
      if (!terminal && !controller.signal.aborted) setFailure({ code: 'malformed-response', message: 'The response ended before a validated final answer. No answer was accepted.', retryable: true });
    } catch (cause) { if (!controller.signal.aborted) setFailure({ code: 'network-loss', message: cause instanceof Error ? cause.message : 'The stream disconnected before validation.', retryable: true }); }
    finally { setLoading(false); setPhase(null); }
  }
  function consume(event: RagStreamEvent, started: boolean, terminal: boolean): { started: boolean; terminal: boolean } {
    if (event.type === 'started') return { started: true, terminal: false }; if (terminal) return { started, terminal };
    if (!started) { setFailure({ code: 'malformed-response', message: 'The stream event order was not supported. No answer was accepted.', retryable: true }); return { started, terminal: true }; }
    if (event.type === 'phase') { setPhase(event.phase); return { started, terminal: false }; }
    if (event.type === 'final') {
      const result = event.response;
      if (result.state !== 'ANSWERED' || !result.answer?.trim() || result.citations.some((item) => !isCitation(item))) { setFailure({ code: 'malformed-response', message: 'The server did not provide a valid final answer. No answer was accepted.', retryable: true }); return { started, terminal: true }; }
      setAnswer({ text: result.answer, citations: result.citations, accountEvidence: result.accountEvidence, handoffAvailable: result.handoffAvailable, accountToolPlan: result.accountToolPlan }); return { started, terminal: true };
    }
    if (event.type === 'refusal') { setRefusal(event.response.refusalReason === 'ACCOUNT_SIGN_IN_REQUIRED' ? 'Select a supplied demo identity to request account evidence. Public documentation questions remain available without sign-in.' : 'No grounded answer is available from the active public evidence.'); return { started, terminal: true }; }
    if (event.type === 'error') { setFailure({ code: event.code, message: event.message, retryable: event.retryable }); return { started, terminal: true }; }
    if (event.type === 'cancelled') { setCancelled(true); return { started, terminal: true }; }
    return { started, terminal };
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  function cancel() { controllerRef.current?.abort(); setLoading(false); setPhase(null); setAnswer(null); setCancelled(true); }
  function reset() { controllerRef.current?.abort(); setSent(''); setAnswer(null); setRefusal(null); setFailure(null); setCancelled(false); setHandoff(null); setHandoffState('idle'); setTicket(null); setLastQuestion(null); inputRef.current?.focus(); }
  async function prepareHandoff() {
    if (!answer || !sent) return; setHandoffState('preparing');
    try { setHandoff(await relayOpsService.support.previewHandoff({ summary: `Question: ${sent}`.slice(0, 600), conversationExcerpt: answer.text.slice(0, 1000), documentationEvidence: answer.citations.map((item) => ({ sourceId: item.sourceLogicalId, ...(item.anchor ? { locator: item.anchor } : {}) })), ...(answer.accountToolPlan ? { accountToolPlan: answer.accountToolPlan } : {}) })); setHandoffState('idle'); }
    catch { setHandoffState('error'); }
  }
  async function confirmHandoff() { if (!handoff) return; setHandoffState('confirming'); try { const result = await relayOpsService.support.confirmHandoff(handoff.draftId); setTicket(result.ticket.reference); setHandoffState('success'); } catch { setHandoffState('error'); } }
  async function cancelHandoff() { if (!handoff) return; try { await relayOpsService.support.cancelHandoff(handoff.draftId); } finally { setHandoff(null); setHandoffState('idle'); } }

  if (!open && !embedded) return <button className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open Relay support"><span aria-hidden="true">✦</span> Ask Relay</button>;
  return <div className="chat-window" role="dialog" aria-label="Relay support" aria-modal={!embedded}>
    <div className="chat-head"><div><b>Relay support <span className="status-dot" style={{ display: 'inline-block' }} /></b><p>Public evidence with a server-selected optional generator · fictional portfolio demo</p></div>{!embedded && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close support chat">×</button>}</div>
    <div className="chat-messages" aria-live="polite">
      {!sent && <><div className="chat-intro"><span className="logo-mark" aria-hidden="true" /><h3>How can I help?</h3><p>Answers are accepted only after the server validates grounded public citations. The selected generator may be unavailable.</p></div><div className="chat-suggestions">{prompts.map((prompt) => <button className="suggestion" key={prompt.label} onClick={() => void ask(prompt.question)} disabled={loading}>{prompt.label} <span aria-hidden="true">→</span></button>)}</div></>}
      {sent && <div className="bubble user">{sent}</div>}
      {loading && <div className="stream-status" role="status"><b>{phase === 'retrieving' ? 'Checking active public evidence' : phase === 'generating' ? 'Generating and validating evidence-backed output' : 'Request accepted'}</b><span className="loading-dots"><span /><span /><span /></span><button className="btn btn-quiet small" onClick={cancel}>Cancel</button></div>}
      {cancelled && !loading && <div className="state-message neutral" role="status"><b>Request cancelled</b><span>No draft or answer was kept.</span></div>}
      {failure && !loading && <div className="state-message failure" role="alert"><b>{failure.code === 'sign-in-required' ? 'Sign-in required' : failure.code === 'provider-unavailable' ? 'Generation provider unavailable' : failure.code === 'timeout' ? 'Generation provider timed out' : 'No validated answer'}</b><span>{failure.message}</span>{failure.retryable && lastQuestion && <button className="btn btn-secondary small" onClick={() => void ask(lastQuestion)}>Retry</button>}</div>}
      {refusal && !loading && <div className="state-message refusal" role="status"><b>No grounded answer</b><span>{refusal}</span></div>}
      {answer && !loading && <><div className="bubble assistant validated-answer"><span className="validated-label">Server-validated final answer</span><p>{answer.text}</p></div>{answer.citations.length > 0 && <section className="evidence-group" aria-label="Documentation citations"><h4>Documentation citations</h4>{answer.citations.map((item) => <CitationCard citation={item} key={item.evidenceId} />)}</section>}{answer.accountEvidence.length > 0 && <section className="evidence-group account-group" aria-label="Private account evidence"><h4>Account evidence <span>Separate from documentation</span></h4><p className="small muted">Synthetic workspace facts were returned by a fixed tenant-safe server tool, never by the generator.</p>{answer.accountEvidence.map((item) => <AccountCard item={item} key={item.kind + ('reference' in item ? item.reference : '')} />)}</section>}{answer.handoffAvailable && <button className="btn btn-primary full-width" onClick={() => void prepareHandoff()} disabled={handoffState === 'preparing'}>Prepare handoff for review</button>}</>}
      {handoff && <HandoffPanel preview={handoff} state={handoffState} onConfirm={() => void confirmHandoff()} onCancel={() => void cancelHandoff()} />}
      {handoffState === 'error' && <div className="state-message failure" role="alert"><b>Handoff preview expired or cannot be replayed</b><span>Nothing was created. Start a new preview and review it again.</span></div>}
      {ticket && <div className="handoff-success" role="status"><b>✦ Synthetic ticket confirmed: {ticket}</b><span>Created only after explicit confirmation; no production ticket was sent.</span></div>}
      {sent && !loading && <button className="btn btn-quiet small" onClick={reset}>← Try another question</button>}
    </div>
    <div className="chat-form"><form onSubmit={submit}><label className="sr-only" htmlFor={embedded ? 'support-input-embedded' : 'support-input'}>Ask a support question</label><input ref={inputRef} id={embedded ? 'support-input-embedded' : 'support-input'} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="Ask a support question…" disabled={loading} /><button className="chat-send" aria-label="Send question" disabled={loading || !question.trim()}>↑</button></form><p className="chat-disclaimer">Original fictional demo. Documentation is public evidence; account facts and handoff need a demo session.</p></div>
  </div>;
}
function CitationCard({ citation }: { citation: Citation }) { return <article className="evidence citation-card"><span className="evidence-type">Active documentation evidence</span><b>{citation.sourceTitle}</b><small>{citation.sourceType}{citation.heading ? ` · ${citation.heading}` : ''}{citation.section ? ` · ${citation.section}` : ''}{citation.page ? ` · page ${citation.page}` : ''}{citation.anchor ? ` · #${citation.anchor}` : ''}</small><p>“{citation.excerpt}”</p></article>; }
function AccountCard({ item }: { item: AccountEvidence }) { const value = item.kind === 'subscription_seat_usage' ? `${item.seatsUsed} of ${item.seatLimit} seats · ${item.planName} · ${item.status}` : `${item.reference} · ${item.status}`; return <article className="evidence account"><span className="evidence-type">Private synthetic account evidence</span><b>{item.label}: {value}</b><small>Returned by a fixed tenant-safe read tool.</small></article>; }
function HandoffPanel({ preview, state, onConfirm, onCancel }: { preview: HandoffPreview; state: string; onConfirm: () => void; onCancel: () => void }) { const expiry = new Date(preview.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return <section className="handoff-panel" aria-label="Handoff confirmation"><span className="evidence-type">Handoff preview · expires {expiry}</span><h4>Review before sharing</h4><p className="small">Only the bounded text and server-recomputed evidence below will be placed in a synthetic ticket.</p><div className="handoff-share"><b>Question / summary</b><p>{preview.shared.summary}</p><b>Transcript excerpt</b><p>{preview.shared.conversationExcerpt ?? 'None'}</p><b>Documentation sources ({preview.shared.documentationEvidence.length})</b><p>{preview.shared.documentationEvidence.map((item) => item.sourceId).join(', ') || 'None'}</p><b>Account evidence ({preview.shared.accountEvidence.length})</b><p>{preview.shared.accountEvidence.map((item) => item.label).join(', ') || 'None'}</p></div><div className="handoff-actions"><button className="btn btn-primary" onClick={onConfirm} disabled={state === 'confirming'}>{state === 'confirming' ? 'Confirming…' : 'Confirm and create synthetic ticket'}</button><button className="btn btn-secondary" onClick={onCancel} disabled={state === 'confirming'}>Cancel</button></div></section>; }
