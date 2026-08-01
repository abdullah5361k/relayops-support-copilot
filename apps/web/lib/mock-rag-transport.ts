/** Deterministic test fixture only. Production imports `relayOpsService.support` (ApiRagClient). */
import type { HandoffPreviewInput, KnowledgeReindexResponse, KnowledgeSearchHit, KnowledgeSnapshot, SupportAnswerResponse } from '@relayops/contracts';
import type { RagClient, RagScenario, RagStreamEvent } from './rag-contracts';

const citation = { evidenceId: 'fixture-active-chunk', sourceLogicalId: 'dispatch-basics', sourceTitle: 'Dispatch basics', sourceType: 'html' as const, heading: 'Acknowledging an urgent job', section: null, page: 2, anchor: 'urgent-job', excerpt: 'A dispatcher should acknowledge an urgent job before assigning the next available technician.' };
const answer = (state: SupportAnswerResponse['state'], text: string | null, reason: SupportAnswerResponse['refusalReason'] = null): SupportAnswerResponse => ({ traceId: 'mock-trace', state, answer: text, citations: text ? [citation] : [], accountEvidence: [], accountToolPlan: null, handoffAvailable: false, refusalReason: reason, suggestedTopics: ['Dispatch basics'], provider: { provider: 'ollama', model: 'qwen3:4b', available: state === 'ANSWERED' } });

export class MockRagClient implements RagClient {
  async *streamAnswer({ question }: { question: string }, signal?: AbortSignal): AsyncIterable<RagStreamEvent> {
    const scenario: RagScenario = question.includes('[mock:') ? (question.match(/\[mock:([^\]]+)/)?.[1] as RagScenario) : 'answer';
    if (scenario === 'malformed') { yield { type: 'started', requestId: 'mock' }; yield { type: 'error', code: 'malformed-response', message: 'Fixture malformed response.', retryable: true }; return; }
    yield { type: 'started', requestId: 'mock' }; yield { type: 'phase', phase: 'retrieving', label: 'Checking fixture evidence' };
    if (signal?.aborted) { yield { type: 'cancelled', message: 'Request cancelled.' }; return; }
    if (scenario === 'unavailable' || scenario === 'timeout' || scenario === 'network') { yield { type: 'error', code: scenario === 'timeout' ? 'timeout' : scenario === 'network' ? 'network-loss' : 'provider-unavailable', message: 'Fixture local provider unavailable.', retryable: true }; return; }
    if (scenario === 'refusal') { yield { type: 'refusal', response: answer('REFUSED', null, 'INSUFFICIENT_EVIDENCE') }; yield { type: 'ended' }; return; }
    const result = answer('ANSWERED', 'Acknowledge the urgent job before assigning the next available technician.');
    if (scenario === 'handoff') result.handoffAvailable = true;
    if (scenario === 'account') { result.accountToolPlan = { tool: 'subscription_seat_usage', arguments: {} }; result.accountEvidence = [{ kind: 'subscription_seat_usage', label: 'Subscription seat usage', planName: 'Synthetic plan', status: 'ACTIVE', seatsUsed: 3, seatLimit: 10 }]; result.citations = []; result.answer = 'The requested synthetic workspace fact is shown below as separate account evidence.'; }
    yield { type: 'phase', phase: 'generating', label: 'Validating fixture answer' }; yield { type: 'final', response: result }; yield { type: 'ended' };
  }
  async previewHandoff(input: HandoffPreviewInput) { return { kind: 'handoff_preview' as const, draftId: '00000000-0000-4000-8000-000000000001', expiresAt: new Date(Date.now() + 300_000).toISOString(), shared: { summary: input.summary, documentationEvidence: input.documentationEvidence, conversationExcerpt: input.conversationExcerpt ?? null, accountEvidence: [] } }; }
  async confirmHandoff(draftId: string) { return { kind: 'handoff_confirmed' as const, draftId, ticket: { reference: 'HND-MOCK-000001', status: 'OPEN' as const }, created: true }; }
  async cancelHandoff() { return; }
  async getKnowledge(): Promise<KnowledgeSnapshot> { return { sources: [], runs: [], model: { name: 'Xenova/all-MiniLM-L6-v2', status: 'unavailable', cache: 'missing', note: 'Test fixture only.' } }; }
  async searchKnowledge(): Promise<KnowledgeSearchHit[]> { return []; }
  async reindexKnowledge(logicalId?: string): Promise<KnowledgeReindexResponse> { return { results: logicalId ? [{ logicalId, status: 'skipped' }] : [], runs: [] }; }
}
export const mockRagClient: RagClient = new MockRagClient();
