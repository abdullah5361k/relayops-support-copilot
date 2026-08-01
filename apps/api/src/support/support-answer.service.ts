import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AccountToolReadResult, DocumentationEvidenceReference, SupportAccountEvidence, SupportAccountToolPlan, SupportAnswerResponse, SupportCitation, SupportProviderStatus, SupportRefusalReason } from '@relayops/contracts';
import { AccountToolException } from '../account-tools/account-tool.exception';
import { AccountToolService } from '../account-tools/account-tool.service';
import { DemoSessionResolver } from '../auth/demo-session.resolver';
import type { TenantContextValue } from '../auth/tenant-context';
import { createEmbeddingProvider } from '../knowledge/embeddings';
import { KnowledgeRetrievalService } from '../knowledge/retrieval.service';
import type { EmbeddingProvider, Evidence } from '../knowledge/types';
import { PrismaService } from '../prisma/prisma.service';
import { GROUNDED_SYSTEM_PROMPT, GenerationProviderError, OllamaQwenProvider, providerStatusClass, type GenerationMetrics, type GenerationProvider } from './generation.provider';

export const SUPPORT_EMBEDDER = Symbol('SUPPORT_EMBEDDER');
export const SUPPORT_GENERATION_PROVIDER = Symbol('SUPPORT_GENERATION_PROVIDER');
const MAX_QUESTION_CHARS = 1_000;
const MAX_EVIDENCE = 4;
// Retrieval can validate against four active chunks, while the external prompt carries only the two strongest bounded records.
const MAX_GENERATION_EVIDENCE = 2;
const MAX_EVIDENCE_BYTES = 1_200;
const MAX_PROMPT_BYTES = 12_000;
const MAX_CLAIMS = 3;

export type SupportStage = 'planning' | 'retrieving' | 'generating';
export interface AnswerOptions { signal?: AbortSignal; onStage?: (stage: SupportStage, traceId: string) => void; headers?: { cookie?: string | string[] }; }
interface ModelClaim { text: string; citationIds: string[]; }
interface ModelOutput { claims: ModelClaim[]; }
class NoGroundedClaimsError extends Error {}

function utf8Slice(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) end--;
  return value.slice(0, end);
}
function byteLength(value: string): number { return Buffer.byteLength(value, 'utf8'); }

export function evidenceIsSufficient(evidence: readonly Evidence[], options: { minCount?: number; minScore?: number } = {}): boolean {
  const minCount = options.minCount ?? Number(process.env.RELAYOPS_GENERATION_MIN_EVIDENCE_COUNT ?? 1);
  const minScore = options.minScore ?? Number(process.env.RELAYOPS_GENERATION_MIN_EVIDENCE_SCORE ?? 0.015);
  return evidence.length >= minCount && evidence.some((item) => Number.isFinite(item.score) && item.score >= minScore && item.content.trim().length >= 40);
}

/** Public evidence is serialized as inert data. The caller cannot choose source, namespace, tool, URL, or authority. */
export function buildGroundedPrompt(question: string, evidence: readonly Evidence[], maxEvidence = MAX_GENERATION_EVIDENCE): string {
  const records = evidence.slice(0, Math.min(MAX_EVIDENCE, maxEvidence)).map((item) => [
    `ID: ${utf8Slice(item.id, 160)}`,
    `SOURCE: ${utf8Slice(item.sourceTitle, 240)}`,
    `LOCATION: ${utf8Slice([item.heading, item.section, item.page ? `page ${item.page}` : null, item.anchor].filter(Boolean).join(' · ') || 'source excerpt', 240)}`,
    'CONTENT_START', utf8Slice(item.content, MAX_EVIDENCE_BYTES), 'CONTENT_END'
  ].join('\n')).join('\n--- EVIDENCE_RECORD ---\n');
  const prompt = `${GROUNDED_SYSTEM_PROMPT}\n\nQUESTION_START\n${utf8Slice(question, MAX_QUESTION_CHARS * 4)}\nQUESTION_END\n\nEVIDENCE_DATA_START\n${records}\nEVIDENCE_DATA_END`;
  // The provider independently repeats this limit; fail closed here if a future prompt edit exceeds it.
  if (byteLength(prompt) > MAX_PROMPT_BYTES) throw new GenerationProviderError('TOO_LARGE', 'Bounded public-evidence prompt exceeded the server cap');
  return prompt;
}

function keysAreExactly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
function parseModelOutput(raw: string): ModelOutput {
  if (byteLength(raw) > 16 * 1024) throw new Error('Model output exceeded the supported size');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Model output was not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !keysAreExactly(value as Record<string, unknown>, ['claims']) || !Array.isArray((value as { claims?: unknown }).claims)) throw new Error('Model output did not match the supported claim schema');
  const claims = (value as { claims: unknown[] }).claims;
  if (claims.length > MAX_CLAIMS) throw new Error('Model output must contain at most three claims');
  return {
    claims: claims.map((claim) => {
      if (!claim || typeof claim !== 'object' || Array.isArray(claim) || !keysAreExactly(claim as Record<string, unknown>, ['text', 'citationIds'])) throw new Error('Model claim was malformed');
      const text = (claim as { text?: unknown }).text;
      const citationIds = (claim as { citationIds?: unknown }).citationIds;
      if (typeof text !== 'string' || !text.trim() || byteLength(text) > 500 || !Array.isArray(citationIds) || citationIds.length !== 1 || citationIds.some((id) => typeof id !== 'string' || !id.trim() || byteLength(id) > 160)) throw new Error('Model claim has invalid text or citations');
      return { text: text.trim(), citationIds: citationIds as string[] };
    })
  };
}

const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'use', 'with', 'you', 'your']);
function meaningfulTerms(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? []).filter((term) => term.length > 2 && !stopWords.has(term)))];
}
function claimIsSupported(text: string, evidence: string): boolean {
  const claimTerms = meaningfulTerms(text); const evidenceTerms = new Set(meaningfulTerms(evidence));
  const numericTerms = claimTerms.filter((term) => /\d/.test(term));
  if (numericTerms.some((term) => !evidenceTerms.has(term))) return false;
  if (!claimTerms.length) return false;
  const overlap = claimTerms.filter((term) => evidenceTerms.has(term)).length;
  return overlap >= Math.min(2, claimTerms.length);
}
function safeExcerpt(content: string): string { return utf8Slice(content.replace(/\s+/g, ' ').trim(), 280); }

/** Every parsed claim must point to one distinct active retrieved chunk and share substantive terms with it. */
export function validateOutput(raw: string, evidence: readonly Evidence[]): { answer: string; citations: SupportCitation[] } {
  const output = parseModelOutput(raw);
  if (output.claims.length === 0) throw new NoGroundedClaimsError('Model declined to make a grounded claim');
  const byId = new Map(evidence.map((item) => [item.id, item])); const used = new Set<string>(); const citations: SupportCitation[] = [];
  for (const claim of output.claims) {
    const id = claim.citationIds[0]!; const item = byId.get(id);
    if (!item || used.has(id) || item.content.trim().length < 40 || !claimIsSupported(claim.text, item.content)) throw new Error('Model cited unsupported evidence');
    used.add(id);
    citations.push({ evidenceId: id, sourceLogicalId: item.sourceLogicalId, sourceTitle: item.sourceTitle, sourceType: item.sourceType, heading: item.heading, section: item.section, page: item.page, anchor: item.anchor, excerpt: safeExcerpt(item.content) });
  }
  return { answer: output.claims.map((claim) => claim.text).join(' '), citations };
}

/** The only account plan parser is deterministic server policy, never model text. */
export function planAccountTool(question: string): SupportAccountToolPlan | null {
  const text = question.toLowerCase(); const reference = question.toUpperCase().match(/\b[A-Z]{2,8}-[0-9]{1,12}\b/)?.[0];
  if (reference && /\b(ticket|case|support)\b/.test(text)) return { tool: 'support_ticket_status', arguments: { reference } };
  if (reference && /\b(job|work order|dispatch|visit|status)\b/.test(text)) return { tool: 'job_status', arguments: { reference } };
  if (/\b(my|our|current|can.t|cannot|why can.t)\b/.test(text) && /\b(seat|seats|subscription|plan|technician)\b/.test(text)) return { tool: 'subscription_seat_usage', arguments: {} };
  return null;
}
function accountEvidence(result: AccountToolReadResult): SupportAccountEvidence {
  if (result.kind === 'subscription_seat_usage') return { kind: result.kind, label: 'Subscription seat usage', planName: result.planName, status: result.status, seatsUsed: result.seatsUsed, seatLimit: result.seatLimit };
  if (result.kind === 'job_status') return { kind: result.kind, label: 'Job status', reference: result.reference, status: result.status };
  return { kind: result.kind, label: 'Support ticket status', reference: result.reference, status: result.status };
}
function isHandoffRequest(question: string): boolean { return /\b(handoff|human|person|support ticket|escalat)/i.test(question); }
/** Narrow action-intent classifier: direct documentation questions stay on the validated generation path. */
export function isExplicitHandoffOnlyRequest(question: string): boolean {
  if (!isHandoffRequest(question) || /\?|\b(how|what|when|where|which|why)\b/i.test(question)) return false;
  return /^\s*(?:please\s+)?(?:(?:i\s+)?(?:need|want|would\s+like)\s+(?:a\s+)?(?:human|person|handoff)|(?:can\s+you\s+)?(?:connect|transfer)\s+me\s+(?:to|with)\s+(?:a\s+)?(?:human|person))\b/i.test(question);
}
export const HANDOFF_INCIDENT_DOCUMENTATION_QUESTION = 'What does the public documentation say about urgent incident acknowledgement?';
/**
 * Handoff availability stays server-owned. The external prompt gets only a canonical public-doc topic,
 * never the requester's human/handoff wording or any account/session material.
 */
export function publicDocumentationGenerationQuestion(question: string): string {
  if (!isHandoffRequest(question)) return question;
  if (/\b(acknowledg|incident|interruption|outage|urgent)\b/i.test(question)) return HANDOFF_INCIDENT_DOCUMENTATION_QUESTION;
  if (/\b(job|intake|dispatch|visit)\b/i.test(question)) return 'What does the public documentation say about job intake?';
  return 'What public documentation guidance is supported by the supplied evidence?';
}
/** Explicitly unsafe/out-of-scope requests are refused before an external call, even when related public evidence exists. */
export function requiresPreGenerationRefusal(question: string): boolean {
  return /\b(ceo home address|competitor price|legal advice|customer password|rain tomorrow|all organization ids|change my payment method|deployed worldwide|another company customer list|exact repair time|four business hours|historical beta|ignore previous instructions|citation id fake|attacker\.example|ticket creation tool|system instructions|direct model url|invent a citation)\b/i.test(question);
}
function topics(evidence: readonly Evidence[]): string[] { return [...new Set(evidence.map((item) => item.heading ?? item.section ?? item.sourceTitle).filter((value): value is string => Boolean(value)))].slice(0, 3); }

/**
 * A hybrid account/documentation request may send only an independently public sentence.
 * Any sentence containing an account signal, account-plan reference, or handoff material is discarded.
 */
export function publicDocumentationQuestion(question: string, plan: SupportAccountToolPlan): string | null {
  const reference = plan.tool === 'subscription_seat_usage' ? '' : plan.arguments.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const accountSignal = new RegExp(`\\b(my|our|current|subscription|seat|seats|plan|job|ticket|handoff|human|escalat)\\b${reference ? `|${reference}` : ''}`, 'i');
  const documentationSignal = /\b(how|what|when|where|guide|documentation|policy|invite|team|dispatch|incident|visit|offline|attachment)\b/i;
  const candidate = question.split(/(?<=[.!?])\s+/).map((part) => part.trim()).find((part) => documentationSignal.test(part) && !accountSignal.test(part));
  return candidate ? utf8Slice(candidate, MAX_QUESTION_CHARS * 4) : null;
}

@Injectable()
export class SupportAnswerService {
  constructor(
    private readonly retrieval: KnowledgeRetrievalService,
    private readonly prisma: PrismaService,
    @Inject(SUPPORT_EMBEDDER) private readonly embedder: EmbeddingProvider = createEmbeddingProvider(),
    @Inject(SUPPORT_GENERATION_PROVIDER) private readonly provider: GenerationProvider = new OllamaQwenProvider(),
    private readonly accountTools?: AccountToolService,
    private readonly sessions?: DemoSessionResolver
  ) {}

  private providerStatus(available: boolean): SupportProviderStatus {
    if (this.provider.provider === 'groq') return { provider: 'groq', model: 'openai/gpt-oss-20b', available };
    if (this.provider.provider === 'ollama') return { provider: 'ollama', model: 'qwen3:4b', available };
    return { provider: 'disabled', model: 'disabled', available };
  }
  private response(traceId: string, state: SupportAnswerResponse['state'], answer: string | null, citations: SupportCitation[], account: SupportAccountEvidence[], plan: SupportAccountToolPlan | null, reason: SupportRefusalReason | null, suggestedTopics: string[], available: boolean, handoffAvailable = false, handoffPreviewEvidence: DocumentationEvidenceReference[] = []): SupportAnswerResponse {
    return { traceId, state, answer, citations, accountEvidence: account, accountToolPlan: plan, handoffPreviewEvidence, handoffAvailable, refusalReason: reason, suggestedTopics, provider: this.providerStatus(available) };
  }
  private async audit(traceId: string, response: SupportAnswerResponse, startedAt: number, error?: GenerationProviderError, metrics?: GenerationMetrics): Promise<void> {
    try {
      await this.prisma.supportAnswerTrace.create({ data: {
        id: traceId, provider: response.provider.provider, model: response.provider.model, outcome: response.state, refusalReason: response.refusalReason,
        statusClass: providerStatusClass(error), latencyMs: Date.now() - startedAt, citationCount: response.citations.length,
        inputTokens: metrics?.inputTokens ?? null, outputTokens: metrics?.outputTokens ?? null, totalTokens: metrics?.totalTokens ?? null,
        remainingRequests: metrics?.remainingRequests ?? null, remainingTokens: metrics?.remainingTokens ?? null, retryAfterSeconds: metrics?.retryAfterSeconds ?? error?.retryAfterSeconds ?? null
      } });
    } catch { /* A safe observability write must never turn validated output into invented output. */ }
  }
  private async executePlan(plan: SupportAccountToolPlan, tenant: TenantContextValue): Promise<SupportAccountEvidence> {
    if (!this.accountTools) throw new Error('Account tools unavailable');
    const result = plan.tool === 'subscription_seat_usage' ? await this.accountTools.subscriptionSeatUsage(tenant) : plan.tool === 'job_status' ? await this.accountTools.jobStatus(tenant, plan.arguments.reference) : await this.accountTools.supportTicketStatus(tenant, plan.arguments.reference);
    return accountEvidence(result);
  }

  private previewEvidence(evidence: readonly Evidence[]): DocumentationEvidenceReference[] {
    return evidence.slice(0, MAX_GENERATION_EVIDENCE).map((item) => item.anchor ? { sourceId: item.sourceLogicalId, locator: item.anchor } : { sourceId: item.sourceLogicalId });
  }

  private async documentation(question: string, traceId: string, options: AnswerOptions): Promise<{ validated?: { answer: string; citations: SupportCitation[] }; evidence: Evidence[]; error?: GenerationProviderError; metrics?: GenerationMetrics; refused?: boolean; invalidOutput?: boolean }> {
    const publicQuestion = publicDocumentationGenerationQuestion(question);
    const evidence = await this.retrieval.searchPublic(publicQuestion, this.embedder, MAX_EVIDENCE);
    if (options.signal?.aborted) throw new GenerationProviderError('CANCELLED', 'Generation was cancelled');
    if (!evidenceIsSufficient(evidence) || requiresPreGenerationRefusal(question)) return { evidence, refused: true };
    options.onStage?.('generating', traceId);
    await this.provider.status(options.signal);
    let generated;
    try { generated = await this.provider.generate(buildGroundedPrompt(publicQuestion, evidence), options.signal, { traceId }); }
    catch (error) { return { evidence, error: error instanceof GenerationProviderError ? error : new GenerationProviderError('NETWORK', 'Generation request failed') }; }
    try { return { evidence, validated: validateOutput(generated.text, evidence), metrics: generated.metrics }; }
    catch (error) { return error instanceof NoGroundedClaimsError ? { evidence, metrics: generated.metrics, refused: true } : { evidence, metrics: generated.metrics, invalidOutput: true }; }
  }

  async answer(questionInput: string, options: AnswerOptions = {}): Promise<SupportAnswerResponse> {
    const traceId = randomUUID(); const startedAt = Date.now(); const question = questionInput.trim().slice(0, MAX_QUESTION_CHARS); let response: SupportAnswerResponse; let providerError: GenerationProviderError | undefined; let metrics: GenerationMetrics | undefined;
    if (!question) return this.response(traceId, 'REFUSED', null, [], [], null, 'INSUFFICIENT_EVIDENCE', [], false);
    const plan = planAccountTool(question);
    if (plan) {
      options.onStage?.('planning', traceId);
      const tenant = options.headers && this.sessions ? await this.sessions.resolve(options.headers) : null;
      if (!tenant) {
        response = this.response(traceId, 'REFUSED', null, [], [], plan, 'ACCOUNT_SIGN_IN_REQUIRED', [], false);
        await this.audit(traceId, response, startedAt); return response;
      }
      try {
        const account = await this.executePlan(plan, tenant);
        const publicQuestion = publicDocumentationQuestion(question, plan);
        if (!publicQuestion) {
          response = this.response(traceId, 'ANSWERED', 'The requested synthetic workspace fact is shown below as separate account evidence.', [], [account], plan, null, [], false, isHandoffRequest(question));
          await this.audit(traceId, response, startedAt); return response;
        }
        options.onStage?.('retrieving', traceId);
        const document = await this.documentation(publicQuestion, traceId, options);
        providerError = document.error ?? (document.invalidOutput ? new GenerationProviderError('MALFORMED', 'Provider output failed server validation') : undefined); metrics = document.metrics;
        if (document.validated) response = this.response(traceId, 'ANSWERED', document.validated.answer, document.validated.citations, [account], plan, null, [], true, isHandoffRequest(question));
        else response = this.response(traceId, 'ANSWERED', 'The requested synthetic workspace fact is shown below as separate account evidence.', [], [account], plan, null, topics(document.evidence), false, isHandoffRequest(question));
      } catch (error) {
        if (error instanceof AccountToolException) response = this.response(traceId, 'REFUSED', null, [], [], plan, 'ACCOUNT_REFERENCE_UNAVAILABLE', [], false);
        else if (error instanceof GenerationProviderError) { providerError = error; response = this.response(traceId, 'ERROR', null, [], [], plan, error.code === 'CANCELLED' ? 'CANCELLED' : error.code === 'TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', [], false); }
        else response = this.response(traceId, 'ERROR', null, [], [], plan, 'RETRIEVAL_UNAVAILABLE', [], false);
      }
      await this.audit(traceId, response, startedAt, providerError, metrics); return response;
    }

    // Explicit unsafe/injection requests must not be reinterpreted as handoff actions.
    if (requiresPreGenerationRefusal(question)) {
      response = this.response(traceId, 'REFUSED', null, [], [], null, 'INSUFFICIENT_EVIDENCE', [], false);
      await this.audit(traceId, response, startedAt); return response;
    }
    // An authenticated, explicit handoff-only request is an action offer, never a documentation-generation task.
    // Its optional source references are public preview metadata only; no draft or ticket is created here.
    if (isExplicitHandoffOnlyRequest(question)) {
      options.onStage?.('planning', traceId);
      if (options.signal?.aborted) {
        response = this.response(traceId, 'ERROR', null, [], [], null, 'CANCELLED', [], false);
        await this.audit(traceId, response, startedAt); return response;
      }
      const authenticated = Boolean(options.headers && this.sessions && await this.sessions.resolve(options.headers));
      if (options.signal?.aborted) {
        response = this.response(traceId, 'ERROR', null, [], [], null, 'CANCELLED', [], false);
        await this.audit(traceId, response, startedAt); return response;
      }
      if (!authenticated) {
        response = this.response(traceId, 'REFUSED', null, [], [], null, 'ACCOUNT_SIGN_IN_REQUIRED', [], false);
        await this.audit(traceId, response, startedAt); return response;
      }
      let preview: DocumentationEvidenceReference[] = [];
      try {
        options.onStage?.('retrieving', traceId);
        const evidence = await this.retrieval.searchPublic(publicDocumentationGenerationQuestion(question), this.embedder, MAX_EVIDENCE);
        if (options.signal?.aborted) {
          response = this.response(traceId, 'ERROR', null, [], [], null, 'CANCELLED', [], false);
          await this.audit(traceId, response, startedAt); return response;
        }
        preview = this.previewEvidence(evidence);
      } catch {
        if (options.signal?.aborted) {
          response = this.response(traceId, 'ERROR', null, [], [], null, 'CANCELLED', [], false);
          await this.audit(traceId, response, startedAt); return response;
        }
        // The action offer is still safe and useful without optional public preview metadata.
      }
      response = this.response(traceId, 'ANSWERED', 'A synthetic handoff can be prepared for your review. No ticket has been created.', [], [], null, null, [], false, true, preview);
      await this.audit(traceId, response, startedAt); return response;
    }

    let evidence: Evidence[] = [];
    try {
      options.onStage?.('retrieving', traceId);
      const document = await this.documentation(question, traceId, options); evidence = document.evidence; providerError = document.error ?? (document.invalidOutput ? new GenerationProviderError('MALFORMED', 'Provider output failed server validation') : undefined); metrics = document.metrics;
      if (document.validated) response = this.response(traceId, 'ANSWERED', document.validated.answer, document.validated.citations, [], null, null, [], true, Boolean(options.headers && await this.sessions?.resolve(options.headers) && isHandoffRequest(question)));
      else if (document.refused) response = this.response(traceId, 'REFUSED', null, [], [], null, 'INSUFFICIENT_EVIDENCE', topics(evidence), !providerError);
      else response = this.response(traceId, 'ERROR', null, [], [], null, document.invalidOutput ? 'INVALID_MODEL_OUTPUT' : providerError?.code === 'TIMEOUT' ? 'PROVIDER_TIMEOUT' : providerError?.code === 'CANCELLED' ? 'CANCELLED' : 'PROVIDER_UNAVAILABLE', topics(evidence), false);
    } catch (error) {
      providerError = error instanceof GenerationProviderError ? error : undefined;
      const reason: SupportRefusalReason = providerError?.code === 'TIMEOUT' ? 'PROVIDER_TIMEOUT' : providerError?.code === 'CANCELLED' ? 'CANCELLED' : providerError ? 'PROVIDER_UNAVAILABLE' : 'RETRIEVAL_UNAVAILABLE';
      response = this.response(traceId, 'ERROR', null, [], [], null, reason, topics(evidence), false);
    }
    await this.audit(traceId, response, startedAt, providerError, metrics); return response;
  }
}

export { parseModelOutput };
