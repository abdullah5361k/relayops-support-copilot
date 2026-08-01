import type {
  HandoffConfirmationResult, HandoffPreviewInput, HandoffPreviewResult, KnowledgeReindexResponse, KnowledgeSearchHit, KnowledgeSnapshot,
  SupportAccountEvidence, SupportAnswerRequest, SupportAnswerResponse, SupportCitation, SupportStreamEvent
} from '@relayops/contracts';

/** Browser-only state projection over the shared API contract. It has no tenant fields. */
export type RagPhase = 'pending' | 'retrieving' | 'generating';
export type RagErrorCode = 'provider-unavailable' | 'timeout' | 'malformed-response' | 'network-loss' | 'cancelled' | 'sign-in-required';
export type RagScenario = 'answer' | 'account' | 'refusal' | 'handoff' | 'unavailable' | 'timeout' | 'malformed' | 'network';
export type Citation = SupportCitation;
export type AccountEvidence = SupportAccountEvidence;
export type HandoffPreview = HandoffPreviewResult;
export type HandoffResult = HandoffConfirmationResult;
export type KnowledgeRun = KnowledgeSnapshot['runs'][number];
export type KnowledgeSearch = KnowledgeSearchHit;
export type { KnowledgeSearchHit, KnowledgeSnapshot, SupportAnswerRequest, SupportAnswerResponse, SupportStreamEvent };

export type RagStreamEvent =
  | { type: 'started'; requestId: string }
  | { type: 'phase'; phase: RagPhase; label: string }
  | { type: 'final'; response: SupportAnswerResponse }
  | { type: 'refusal'; response: SupportAnswerResponse }
  | { type: 'error'; code: RagErrorCode; message: string; retryable: boolean }
  | { type: 'cancelled'; message: string }
  | { type: 'ended' };

export interface RagClient {
  streamAnswer(request: SupportAnswerRequest, signal?: AbortSignal): AsyncIterable<RagStreamEvent>;
  previewHandoff(input: HandoffPreviewInput): Promise<HandoffPreview>;
  confirmHandoff(draftId: string): Promise<HandoffResult>;
  cancelHandoff(draftId: string): Promise<void>;
  getKnowledge(): Promise<KnowledgeSnapshot>;
  searchKnowledge(query: string): Promise<KnowledgeSearchHit[]>;
  reindexKnowledge(logicalId?: string): Promise<KnowledgeReindexResponse>;
}

const sourceTypes = new Set(['html', 'faq-json', 'pdf', 'docx']);
export function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.evidenceId === 'string' && typeof item.sourceLogicalId === 'string' && typeof item.sourceTitle === 'string'
    && sourceTypes.has(String(item.sourceType)) && typeof item.excerpt === 'string'
    && (item.heading === null || typeof item.heading === 'string') && (item.section === null || typeof item.section === 'string')
    && (item.page === null || Number.isInteger(item.page)) && (item.anchor === null || typeof item.anchor === 'string');
}
export function isValidatedAnswer(value: unknown): value is SupportAnswerResponse {
  if (!value || typeof value !== 'object') return false;
  const answer = value as Partial<SupportAnswerResponse>;
  return typeof answer.traceId === 'string' && (answer.state === 'ANSWERED' || answer.state === 'REFUSED' || answer.state === 'ERROR')
    && Array.isArray(answer.citations) && answer.citations.every(isCitation) && Array.isArray(answer.accountEvidence)
    && (answer.answer === null || typeof answer.answer === 'string') && (answer.refusalReason === null || typeof answer.refusalReason === 'string');
}
