import type { HandoffConfirmationResult, HandoffPreviewInput, HandoffPreviewResult, KnowledgeReindexResponse, KnowledgeSearchHit, KnowledgeSnapshot, SupportAnswerRequest, SupportAnswerResponse, SupportStreamEvent } from '@relayops/contracts';
import { isCitation, isValidatedAnswer, type RagClient, type RagErrorCode, type RagStreamEvent } from './rag-contracts';

const MAX_QUESTION = 1_000;
const MAX_JSON = 64 * 1024;
const MAX_STREAM = 256 * 1024;
type FetchLike = typeof fetch;

function error(code: RagErrorCode, message: string, retryable = true): RagStreamEvent { return { type: 'error', code, message, retryable }; }
function cleanQuestion(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A support question is required.');
  const question = value.replace(/\p{Cc}/gu, ' ').trim();
  if (!question || question.length > MAX_QUESTION) throw new Error('Use a question between 1 and 1000 characters.');
  return question;
}
function isProvider(value: unknown): boolean { return !!value && typeof value === 'object' && (value as { provider?: unknown }).provider === 'ollama' && (value as { model?: unknown }).model === 'qwen3:4b' && typeof (value as { available?: unknown }).available === 'boolean'; }
function isStreamEvent(value: unknown): value is SupportStreamEvent {
  if (!value || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') return false;
  const event = value as Partial<SupportStreamEvent> & { type: string };
  if (event.type === 'lifecycle') return typeof event.traceId === 'string' && ['planning', 'retrieving', 'generating', 'complete'].includes(String(event.stage));
  if (event.type === 'status') return typeof event.traceId === 'string' && isProvider(event.provider);
  return (event.type === 'final' || event.type === 'refusal' || event.type === 'error') && isValidatedAnswer(event.response);
}
async function json(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_JSON) throw new Error('Response exceeded the supported size.');
  const text = await response.text(); if (text.length > MAX_JSON) throw new Error('Response exceeded the supported size.');
  try { return JSON.parse(text); } catch { throw new Error('Response was not valid JSON.'); }
}
function httpMessage(status: number): { code: RagErrorCode; message: string; retryable: boolean } {
  if (status === 401) return { code: 'sign-in-required', message: 'Select a supplied demo identity to access account evidence or handoff.', retryable: false };
  return { code: 'network-loss', message: 'The local API did not return a supported response.', retryable: status >= 500 };
}

/** Same-origin browser transport. No scenario/query selector exists in this production adapter. */
export class ApiRagClient implements RagClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async *streamAnswer(request: SupportAnswerRequest, signal?: AbortSignal): AsyncIterable<RagStreamEvent> {
    let question: string;
    try { question = cleanQuestion(request.question); } catch (cause) { yield error('malformed-response', cause instanceof Error ? cause.message : 'Invalid question.', false); return; }
    let response: Response;
    try {
      const fetcher = this.fetcher;
      response = await fetcher('/api/support/answers/stream', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ question }), signal });
    } catch (cause) {
      if (signal?.aborted) yield { type: 'cancelled', message: 'Request cancelled. No draft or answer was retained.' };
      else yield error('network-loss', cause instanceof Error ? cause.message : 'The stream could not be started.');
      return;
    }
    if (!response.ok || !response.body) { const mapped = httpMessage(response.status); yield error(mapped.code, mapped.message, mapped.retryable); return; }
    yield { type: 'started', requestId: 'pending' };
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let bytes = 0;
    let traceId: string | null = null; let terminal: SupportAnswerResponse | null = null; let terminalKind: 'final' | 'refusal' | 'error' | null = null; let complete = false; let malformed: string | null = null;
    const consumeFrame = (frame: string): RagStreamEvent | null => {
      if (!frame.trim()) return null;
      const lines = frame.split(/\r?\n/); let declared = 'message'; const data: string[] = [];
      for (const line of lines) { if (line.startsWith('event:')) declared = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); }
      if (!data.length || data.join('\n').length > MAX_JSON) throw new Error('Malformed SSE frame.');
      let event: unknown; try { event = JSON.parse(data.join('\n')); } catch { throw new Error('Malformed SSE JSON.'); }
      if (!isStreamEvent(event) || declared !== event.type) throw new Error('Unsupported SSE event.');
      if (event.type === 'lifecycle') {
        if (!traceId) traceId = event.traceId;
        if (event.traceId !== traceId || (event.stage === 'complete' && !terminal)) throw new Error('Out-of-order SSE lifecycle.');
        if (event.stage === 'complete') complete = true;
        if (event.stage === 'planning') return { type: 'phase', phase: 'pending', label: 'Resolving the safe request plan' };
        if (event.stage === 'retrieving') return { type: 'phase', phase: 'retrieving', label: 'Checking active public evidence' };
        if (event.stage === 'generating') return { type: 'phase', phase: 'generating', label: 'Validating a local Qwen answer' };
        return null;
      }
      if (event.type === 'status') { if (!traceId || event.traceId !== traceId || terminal) throw new Error('Out-of-order SSE status.'); return null; }
      const answer = event.response;
      if (!isValidatedAnswer(answer) || (!traceId ? (traceId = answer.traceId, false) : answer.traceId !== traceId) || terminal) throw new Error('Malformed terminal SSE response.');
      if ((event.type === 'final' && answer.state !== 'ANSWERED') || (event.type === 'refusal' && answer.state !== 'REFUSED') || (event.type === 'error' && answer.state !== 'ERROR')) throw new Error('Terminal response state did not match event.');
      if (answer.state === 'ANSWERED' && (!answer.answer?.trim() || answer.citations.some((item) => !isCitation(item)))) throw new Error('Answer was not server-validated.');
      terminal = answer; terminalKind = event.type; return null;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength; if (bytes > MAX_STREAM) throw new Error('Stream exceeded the supported size.');
        pending += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = pending.search(/\r?\n\r?\n/)) >= 0) {
          const frame = pending.slice(0, boundary); const delimiter = pending.match(/\r?\n\r?\n/)?.[0].length ?? 2; pending = pending.slice(boundary + delimiter);
          const next = consumeFrame(frame); if (next) yield next;
        }
      }
      pending += decoder.decode(); if (pending.trim()) { const next = consumeFrame(pending); if (next) yield next; }
      if (!terminal || !terminalKind || !complete) throw new Error('Stream ended before a complete validated response.');
      const terminalResponse = terminal as SupportAnswerResponse;
      if (terminalKind === 'final') yield { type: 'final', response: terminalResponse };
      else if (terminalKind === 'refusal') yield { type: 'refusal', response: terminalResponse };
      else yield error(terminalResponse.refusalReason === 'PROVIDER_TIMEOUT' ? 'timeout' : terminalResponse.refusalReason === 'ACCOUNT_SIGN_IN_REQUIRED' ? 'sign-in-required' : 'provider-unavailable', 'No validated answer is available from the local service.', terminalResponse.refusalReason !== 'ACCOUNT_SIGN_IN_REQUIRED');
      yield { type: 'ended' };
    } catch (cause) { await reader.cancel().catch(() => undefined); if (signal?.aborted) yield { type: 'cancelled', message: 'Request cancelled. No draft or answer was retained.' }; else { malformed = cause instanceof Error ? cause.message : 'Malformed stream.'; yield error('malformed-response', `${malformed} No answer was accepted.`); } }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const fetcher = this.fetcher;
    const response = await fetcher(path, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    if (!response.ok) { const mapped = httpMessage(response.status); throw new Error(mapped.message); }
    return json(response) as Promise<T>;
  }
  async previewHandoff(input: HandoffPreviewInput): Promise<HandoffPreviewResult> { const value = await this.request<HandoffPreviewResult>('/api/account-tools/handoffs/preview', { method: 'POST', body: JSON.stringify(input) }); if (!value || value.kind !== 'handoff_preview' || typeof value.draftId !== 'string' || !value.shared) throw new Error('Handoff preview response was invalid.'); return value; }
  async confirmHandoff(draftId: string): Promise<HandoffConfirmationResult> { const value = await this.request<HandoffConfirmationResult>('/api/account-tools/handoffs/confirm', { method: 'POST', body: JSON.stringify({ draftId }) }); if (!value || value.kind !== 'handoff_confirmed' || typeof value.ticket?.reference !== 'string') throw new Error('Handoff confirmation response was invalid.'); return value; }
  async cancelHandoff(draftId: string): Promise<void> { await this.request('/api/account-tools/handoffs/cancel', { method: 'POST', body: JSON.stringify({ draftId }) }); }
  async getKnowledge(): Promise<KnowledgeSnapshot> { const value = await this.request<KnowledgeSnapshot>('/api/knowledge'); if (!value || !Array.isArray(value.sources) || !Array.isArray(value.runs)) throw new Error('Knowledge response was invalid.'); return value; }
  async searchKnowledge(query: string): Promise<KnowledgeSearchHit[]> { const value = await this.request<{ evidence: KnowledgeSearchHit[] }>(`/api/knowledge/search?q=${encodeURIComponent(cleanQuestion(query))}`); if (!value || !Array.isArray(value.evidence) || value.evidence.some((item) => !item || !isCitation(item.citation))) throw new Error('Knowledge search response was invalid.'); return value.evidence; }
  async reindexKnowledge(logicalId?: string): Promise<KnowledgeReindexResponse> { const value = await this.request<KnowledgeReindexResponse>('/api/knowledge/reindex', { method: 'POST', body: JSON.stringify(logicalId ? { logicalId } : {}) }); if (!value || !Array.isArray(value.results) || !Array.isArray(value.runs)) throw new Error('Knowledge reindex response was invalid.'); return value; }
}
