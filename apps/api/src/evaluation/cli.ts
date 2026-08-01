import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GenerationContext, GenerationMetrics, GenerationProvider, ProviderRequestDiagnostics, ProviderStatus } from '../support/generation.provider';
import { buildGroqChatPayload, GROQ_MODEL, GenerationProviderError, GroqProvider, OllamaQwenProvider, QWEN_MODEL } from '../support/generation.provider';
import { buildGroundedPrompt, SupportAnswerService } from '../support/support-answer.service';
import { AccountToolService } from '../account-tools/account-tool.service';
import { DemoSessionResolver } from '../auth/demo-session.resolver';
import { demoProfiles } from '../auth/demo-identities';
import { DeterministicEmbeddingProvider, MiniLmEmbeddingProvider } from '../knowledge/embeddings';
import { KnowledgeIngestionService } from '../knowledge/ingestion.service';
import { KnowledgeRetrievalService } from '../knowledge/retrieval.service';
import type { EmbeddingProvider } from '../knowledge/types';
import { PrismaService } from '../prisma/prisma.service';

type Item = { id: string; category: string; question: string; expectedSources: string[]; expectedOutcome: 'ANSWERED' | 'REFUSED'; session: 'public' | 'northstar-owner' | 'primeflow-owner'; expectedTool?: 'subscription_seat_usage' | 'job_status' | 'support_ticket_status'; handoffAvailable?: boolean };
type SetFile = { version: string; questions: Item[] };
type Mode = 'deterministic' | 'integrated' | 'real-model' | 'real-groq' | 'groq-smoke' | 'groq-regression' | 'groq-diagnose';
type CategoryMetrics = { total: number; retrievalHit: number; outcome: number; citationValid: number; coverage: number; tool: number; handoff: number; unsupported: number; stale: number; namespace: number; tenant: number; providerInvocations: number; providerErrors: number; latencies: number[]; tokens: number };
const GROQ_REGRESSION_IDS = ['ack-hour', 'site-closeout', 'arrival-change', 'multi-contact', 'stale-beta', 'confirm-only', 'no-create'] as const;
const GROQ_REGRESSION_NO_CALL_IDS = new Set<string>(['stale-beta']);
const GROQ_DIAGNOSIS_IDS = ['ack-hour', 'multi-contact'] as const;
type RegressionCheck = { id: string; expected: Item['expectedOutcome']; actual: string; providerInvoked: boolean; expectedNoCall: boolean; providerError: boolean; providerErrorCode?: string; providerErrorType?: string; requestBounds?: ProviderRequestDiagnostics; tokenUse?: Pick<GenerationMetrics, 'inputTokens' | 'outputTokens' | 'totalTokens'>; schemaRetry?: boolean; citationCount: number; citedAnswer: boolean };

class DeterministicEvaluationProvider implements GenerationProvider {
  readonly provider = 'ollama' as const;
  readonly model = QWEN_MODEL;
  async status(): Promise<ProviderStatus> { return { provider: this.provider, model: this.model, available: true }; }
  async generate(prompt: string): Promise<{ text: string }> {
    const question = prompt.match(/QUESTION_START\n([\s\S]*?)\nQUESTION_END/)?.[1]?.toLowerCase() ?? '';
    if (/ignore|reveal|competitor|ceo|legal|password|weather|rain|organization id|payment method|worldwide|another company|invent|direct model url|historical beta|four business hours|citation id|https|tool now|document as system|create a ticket|exact repair time/.test(question)) return { text: '{"claims":[]}' };
    const records = [...prompt.matchAll(/ID: ([^\n]+)\nSOURCE: ([^\n]+)\nLOCATION:[\s\S]*?\nCONTENT_START\n([\s\S]*?)\nCONTENT_END/g)].map((match) => ({ id: match[1]!, source: match[2]!.toLowerCase(), text: match[3]!.replace(/\s+/g, ' ').trim().slice(0, 450) }));
    const wanted = /field visit and a completed job|before a visit and for a new job/.test(question) ? ['field visit manual', 'dispatch basics']
      : /urgent|incident|outage|acknowledgement/.test(question) ? ['incident response policy']
        : /attachment|offline|support request|payment card/.test(question) ? ['public faq']
          : /site|entering|arrival|materials|field visit/.test(question) ? ['field visit manual']
            : /first week|trainee|escalation|condition/.test(question) ? ['onboarding guide'] : ['dispatch basics'];
    const selected = wanted.map((name) => records.find((record) => record.source.includes(name))).filter((record): record is { id: string; source: string; text: string } => Boolean(record));
    return { text: selected.length ? JSON.stringify({ claims: selected.map((record) => ({ text: record.text, citationIds: [record.id] })) }) : '{"claims":[]}' };
  }
}

/** Records only operational evaluator counters; it never retains prompt/evidence/answer/account text. */
class RecordingProvider implements GenerationProvider {
  readonly provider: GenerationProvider['provider'];
  readonly model: GenerationProvider['model'];
  invocations = 0;
  errors = 0;
  inputTokens = 0;
  outputTokens = 0;
  totalTokens = 0;
  latestRate: Pick<GenerationMetrics, 'remainingRequests' | 'remainingTokens' | 'retryAfterSeconds'> = {};
  lastMetrics: GenerationMetrics | undefined;
  lastFailure: GenerationProviderError | undefined;
  constructor(private readonly inner: GenerationProvider) { this.provider = inner.provider; this.model = inner.model; }
  async status(signal?: AbortSignal): Promise<ProviderStatus> { return this.inner.status(signal); }
  async generate(prompt: string, signal?: AbortSignal, context?: GenerationContext) {
    this.invocations++;
    try {
      const result = await this.inner.generate(prompt, signal, context); const metrics = result.metrics;
      this.inputTokens += metrics?.inputTokens ?? 0; this.outputTokens += metrics?.outputTokens ?? 0; this.totalTokens += metrics?.totalTokens ?? 0;
      this.latestRate = { remainingRequests: metrics?.remainingRequests, remainingTokens: metrics?.remainingTokens, retryAfterSeconds: metrics?.retryAfterSeconds };
      this.lastMetrics = metrics; this.lastFailure = undefined; return result;
    } catch (error) { this.errors++; this.lastFailure = error instanceof GenerationProviderError ? error : undefined; throw error; }
  }
}

function cookie(identity: Item['session']): { cookie?: string } { const profile = demoProfiles.find((entry) => entry.identity === identity); return profile ? { cookie: `relayops_demo_session=${profile.sessionToken}` } : {}; }
function mean(values: number[]): number { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function percentile(values: number[], point: number): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * point) - 1))]!); }
function pct(value: number): number { return Number(value.toFixed(3)); }
function bytes(value: string): number { return Buffer.byteLength(value, 'utf8'); }
function emptyMetrics(): CategoryMetrics { return { total: 0, retrievalHit: 0, outcome: 0, citationValid: 0, coverage: 0, tool: 0, handoff: 0, unsupported: 0, stale: 0, namespace: 0, tenant: 0, providerInvocations: 0, providerErrors: 0, latencies: [], tokens: 0 }; }
function modeFromArg(value: string | undefined): Mode | null {
  return value === 'deterministic' || value === 'integrated' || value === 'real-model' || value === 'real-groq' || value === 'groq-smoke' || value === 'groq-regression' || value === 'groq-diagnose' ? value : null;
}
function evaluationPaceMs(mode: Mode): number {
  const value = Number(process.env.RELAYOPS_EVALUATION_PACE_MS ?? 0);
  if ((mode !== 'real-groq' && mode !== 'groq-smoke' && mode !== 'groq-regression' && mode !== 'groq-diagnose') || !Number.isFinite(value) || value < 0 || value > 60_000) return 0;
  return Math.floor(value);
}
function modeLabel(mode: Mode): string {
  if (mode === 'deterministic') return 'deterministic-double-not-groq';
  if (mode === 'integrated') return 'deterministic-provider-with-real-minilm-not-groq';
  if (mode === 'real-model') return 'real-local-qwen-historical-path-unverified';
  if (mode === 'groq-regression') return 'real-groq-current-code-regression';
  if (mode === 'groq-diagnose') return 'real-groq-sanitized-diagnosis';
  return 'real-groq-openai-gpt-oss-20b';
}

async function main(): Promise<void> {
  const mode = modeFromArg(process.argv[2]);
  if (!mode) throw new Error('Usage: evaluation:(deterministic|integrated|real-model|real-groq|groq-smoke|groq-regression|groq-diagnose)');
  const root = resolve(__dirname, '../../../..'); const set = JSON.parse(await readFile(resolve(root, 'corpus/support-evaluation.v1.json'), 'utf8')) as SetFile;
  if (set.version !== 'v1' || set.questions.length !== 60 || new Set(set.questions.map((item) => item.id)).size !== 60) throw new Error('Support evaluation set must be the complete versioned 60-question v1 set');
  const prisma = new PrismaService(); await prisma.$connect();
  try {
    const useRealEmbedding = mode === 'integrated' || mode === 'real-model' || mode === 'real-groq' || mode === 'groq-smoke' || mode === 'groq-regression' || mode === 'groq-diagnose';
    const embedder: EmbeddingProvider = useRealEmbedding ? new MiniLmEmbeddingProvider() : new DeterministicEmbeddingProvider();
    if (mode === 'deterministic') {
      const ingest = await new KnowledgeIngestionService(prisma).ingestCommittedCorpus(embedder);
      if (ingest.some((entry) => entry.status === 'failed')) throw new Error('Deterministic evaluation ingestion failed; use a fresh local evaluation database.');
    }
    const rawProvider: GenerationProvider = mode === 'real-groq' || mode === 'groq-smoke' || mode === 'groq-regression' || mode === 'groq-diagnose' ? new GroqProvider() : mode === 'real-model' ? new OllamaQwenProvider() : new DeterministicEvaluationProvider();
    const provider = new RecordingProvider(rawProvider); const retrieval = new KnowledgeRetrievalService(prisma);
    const service = new SupportAnswerService(retrieval, prisma, embedder, provider, new AccountToolService(prisma), new DemoSessionResolver(prisma));
    const items = mode === 'groq-smoke' ? set.questions.filter((item) => item.category === 'documentation').slice(0, 1) : mode === 'groq-regression' ? set.questions.filter((item) => GROQ_REGRESSION_IDS.includes(item.id as (typeof GROQ_REGRESSION_IDS)[number])) : mode === 'groq-diagnose' ? set.questions.filter((item) => GROQ_DIAGNOSIS_IDS.includes(item.id as (typeof GROQ_DIAGNOSIS_IDS)[number])) : set.questions;
    if (mode === 'groq-regression' && (items.length !== GROQ_REGRESSION_IDS.length || items.some((item, index) => item.id !== GROQ_REGRESSION_IDS[index]))) throw new Error('Groq regression set no longer matches the recorded former-error cases');
    if (mode === 'groq-diagnose' && (items.length !== GROQ_DIAGNOSIS_IDS.length || items.some((item, index) => item.id !== GROQ_DIAGNOSIS_IDS[index]))) throw new Error('Groq diagnosis set no longer matches the cited/failing comparison cases');
    const diagnosisBounds = new Map<string, { current: ProviderRequestDiagnostics & { reservedTokenBound: number }; preReduction?: ProviderRequestDiagnostics & { reservedTokenBound: number } }>();
    if (mode === 'groq-diagnose') {
      for (const item of items) {
        const evidence = await retrieval.searchPublic(item.question, embedder, 4);
        const bounded = (maxEvidence: number) => {
          const prompt = buildGroundedPrompt(item.question, evidence, maxEvidence); const payload = buildGroqChatPayload(prompt);
          const schema = ((payload.response_format as { json_schema?: { schema?: unknown } }).json_schema?.schema);
          const boundedPromptBytes = bytes(prompt);
          return { requestBytes: bytes(JSON.stringify(payload)), boundedPromptBytes, schemaBytes: bytes(JSON.stringify(schema)), evidenceRecordCount: Math.min(maxEvidence, evidence.length), reservedTokenBound: Math.ceil(boundedPromptBytes / 4) + 420 };
        };
        diagnosisBounds.set(item.id, { current: bounded(2), preReduction: item.id === 'multi-contact' ? bounded(4) : undefined });
      }
    }
    const paceMs = evaluationPaceMs(mode);
    const beforeTickets = await prisma.supportTicket.count(); const category = new Map<string, CategoryMetrics>(); const details: unknown[] = []; const regressionChecks: RegressionCheck[] = [];
    for (const [index, item] of items.entries()) {
      const metrics = category.get(item.category) ?? emptyMetrics(); category.set(item.category, metrics); metrics.total++;
      const invocations = provider.invocations; const errors = provider.errors; const tokens = provider.totalTokens; const started = performance.now();
      const response = await service.answer(item.question, { headers: cookie(item.session) }); const latency = performance.now() - started; metrics.latencies.push(latency);
      metrics.providerInvocations += provider.invocations - invocations; metrics.providerErrors += provider.errors - errors; metrics.tokens += provider.totalTokens - tokens;
      const citationSources = new Set(response.citations.map((entry) => entry.sourceLogicalId)); const retrievalHit = !item.expectedSources.length || item.expectedSources.every((source) => citationSources.has(source));
      const citationValid = response.citations.every((entry) => entry.evidenceId && entry.excerpt && ['html', 'faq-json', 'pdf', 'docx'].includes(entry.sourceType));
      const coverage = response.state !== 'ANSWERED' || response.accountEvidence.length > 0 || response.citations.length > 0;
      const outcome = response.state === item.expectedOutcome; const tool = !item.expectedTool || response.accountToolPlan?.tool === item.expectedTool;
      const handoff = item.handoffAvailable === undefined || response.handoffAvailable === item.handoffAvailable;
      const unsupported = response.state === 'ANSWERED' && response.citations.length === 0 && response.accountEvidence.length === 0;
      const stale = response.citations.some((entry) => entry.excerpt.toLowerCase().includes('four business hours'));
      const namespace = response.citations.some((entry) => entry.sourceLogicalId.startsWith('private-'));
      const tenant = item.category === 'account_isolation' && item.expectedOutcome === 'ANSWERED' && (response.accountEvidence.length !== 1 || response.citations.length !== 0);
      metrics.retrievalHit += Number(retrievalHit); metrics.outcome += Number(outcome); metrics.citationValid += Number(citationValid); metrics.coverage += Number(coverage); metrics.tool += Number(tool); metrics.handoff += Number(handoff); metrics.unsupported += Number(unsupported); metrics.stale += Number(stale); metrics.namespace += Number(namespace); metrics.tenant += Number(tenant);
      // Never include user question, answer, evidence text, tenant values, session material, or provider prompt in an evaluator report.
      const providerInvoked = provider.invocations > invocations;
      const providerError = provider.errors > errors;
      const failure = providerError ? provider.lastFailure : undefined;
      const successfulMetrics = providerInvoked && !providerError ? provider.lastMetrics : undefined;
      const requestBounds = failure?.diagnostics ?? (successfulMetrics ? { requestBytes: successfulMetrics.requestBytes!, boundedPromptBytes: successfulMetrics.boundedPromptBytes!, schemaBytes: successfulMetrics.schemaBytes!, evidenceRecordCount: successfulMetrics.evidenceRecordCount! } : undefined);
      details.push({ id: item.id, category: item.category, expected: item.expectedOutcome, actual: response.state, retrievalHit, citationCount: response.citations.length, tool: response.accountToolPlan?.tool ?? null, handoffAvailable: response.handoffAvailable, providerInvoked, providerError, providerErrorCode: failure?.providerErrorCode, providerErrorType: failure?.providerErrorType, latencyMs: Math.round(latency) });
      if (mode === 'groq-regression' || mode === 'groq-diagnose') regressionChecks.push({ id: item.id, expected: item.expectedOutcome, actual: response.state, providerInvoked, expectedNoCall: GROQ_REGRESSION_NO_CALL_IDS.has(item.id), providerError, providerErrorCode: failure?.providerErrorCode, providerErrorType: failure?.providerErrorType, requestBounds, tokenUse: successfulMetrics ? { inputTokens: successfulMetrics.inputTokens, outputTokens: successfulMetrics.outputTokens, totalTokens: successfulMetrics.totalTokens } : undefined, schemaRetry: successfulMetrics?.schemaRetry, citationCount: response.citations.length, citedAnswer: item.id === 'ack-hour' && response.state === 'ANSWERED' && response.citations.length > 0 && citationValid });
      // Deliberate operator-selected pacing applies only after an external invocation, never as a hidden retry/sleep.
      if (paceMs && providerInvoked && index < items.length - 1) await new Promise<void>((resolve) => setTimeout(resolve, paceMs));
    }
    const afterTickets = await prisma.supportTicket.count();
    const byCategory = Object.fromEntries([...category].map(([name, value]) => [name, {
      count: value.total, retrievalHitRate: pct(value.retrievalHit / value.total), outcomeRate: pct(value.outcome / value.total), citationValidity: pct(value.citationValid / value.total), citationCoverage: pct(value.coverage / value.total), toolPrecision: pct(value.tool / value.total), handoffSafety: pct(value.handoff / value.total), unsupportedClaimRate: pct(value.unsupported / value.total), staleVersionViolations: value.stale, namespaceViolations: value.namespace, tenantViolations: value.tenant, providerInvocations: value.providerInvocations, providerErrors: value.providerErrors, tokenUse: value.tokens, latencyMs: { mean: Math.round(mean(value.latencies)), p50: percentile(value.latencies, 0.5), p95: percentile(value.latencies, 0.95), max: Math.round(Math.max(...value.latencies)) }
    }]));
    const totals = [...category.values()]; const total = items.length;
    const aggregate = { retrievalHitRate: pct(totals.reduce((sum, value) => sum + value.retrievalHit, 0) / total), outcomeRate: pct(totals.reduce((sum, value) => sum + value.outcome, 0) / total), citationValidity: pct(totals.reduce((sum, value) => sum + value.citationValid, 0) / total), citationCoverage: pct(totals.reduce((sum, value) => sum + value.coverage, 0) / total), toolPrecision: pct(totals.reduce((sum, value) => sum + value.tool, 0) / total), handoffSafety: pct(totals.reduce((sum, value) => sum + value.handoff, 0) / total), unsupportedClaimRate: pct(totals.reduce((sum, value) => sum + value.unsupported, 0) / total), staleVersionViolations: totals.reduce((sum, value) => sum + value.stale, 0), namespaceViolations: totals.reduce((sum, value) => sum + value.namespace, 0), tenantViolations: totals.reduce((sum, value) => sum + value.tenant, 0), providerInvocations: provider.invocations, providerErrors: provider.errors, tokenUse: { input: provider.inputTokens, output: provider.outputTokens, total: provider.totalTokens }, rateLimit: provider.latestRate, latencyMs: { p50: percentile(totals.flatMap((value) => value.latencies), 0.5), p95: percentile(totals.flatMap((value) => value.latencies), 0.95) }, handoffMutationsBeforeConfirmation: afterTickets - beforeTickets };
    const regressionPass = mode === 'groq-regression' && regressionChecks.length === GROQ_REGRESSION_IDS.length && regressionChecks.every((check) => check.actual === check.expected && check.providerError === false && (check.expectedNoCall ? !check.providerInvoked : check.providerInvoked)) && regressionChecks.some((check) => check.id === 'ack-hour' && check.citedAnswer) && provider.provider === 'groq' && provider.model === GROQ_MODEL && provider.errors === 0 && aggregate.citationValidity === 1 && aggregate.citationCoverage === 1 && aggregate.unsupportedClaimRate === 0 && aggregate.staleVersionViolations === 0 && aggregate.namespaceViolations === 0 && aggregate.tenantViolations === 0 && aggregate.handoffMutationsBeforeConfirmation === 0;
    const report = mode === 'groq-smoke' ? { kind: 'real-groq-minimal-smoke', provider: 'groq', model: GROQ_MODEL, authenticated: provider.invocations === 1 && provider.errors === 0, validatedCitedAnswer: aggregate.citationValidity === 1 && aggregate.citationCoverage === 1 && aggregate.outcomeRate === 1, citationCount: totals.reduce((sum, value) => sum + value.citationValid, 0), tokenUse: aggregate.tokenUse, rateLimit: aggregate.rateLimit, latencyMs: aggregate.latencyMs, note: 'No question, evidence, answer, account value, or credential is printed.' } : mode === 'groq-regression' ? { kind: 'real-groq-current-code-regression', provider: 'groq', model: GROQ_MODEL, fixedModelIdentity: provider.provider === 'groq' && provider.model === GROQ_MODEL, passed: regressionPass, cases: regressionChecks, zeroProviderErrors: provider.errors === 0, validatedCitedAnswer: regressionChecks.some((check) => check.id === 'ack-hour' && check.citedAnswer), safeOutcomes: { unsupportedClaimRate: aggregate.unsupportedClaimRate, staleVersionViolations: aggregate.staleVersionViolations, namespaceViolations: aggregate.namespaceViolations, tenantViolations: aggregate.tenantViolations, handoffMutationsBeforeConfirmation: aggregate.handoffMutationsBeforeConfirmation }, tokenUse: aggregate.tokenUse, rateLimit: aggregate.rateLimit, latencyMs: aggregate.latencyMs, note: 'No question, evidence text, answer text, account value, session material, or credential is printed.' } : mode === 'groq-diagnose' ? { kind: 'real-groq-sanitized-diagnosis', provider: 'groq', model: GROQ_MODEL, fixedModelIdentity: provider.provider === 'groq' && provider.model === GROQ_MODEL, currentCases: regressionChecks, requestBounds: Object.fromEntries(diagnosisBounds), preReductionComparison: { caseId: 'multi-contact', priorObservedStatusClass: 'bad_request', priorEvidenceRecordCount: 4, currentEvidenceRecordCount: 2 }, note: 'Only sanitized provider code/type and numerical request/schema/token bounds are printed; no response body, question, evidence, answer, account value, session material, or credential is retained.' } : { evaluationSet: `support-${set.version}`, mode: modeLabel(mode), provider: { provider: provider.provider, model: provider.model }, evaluationPaceMs: paceMs, thresholds: { deterministic: 'retrieval/outcome/tool/handoff >= 0.90; citation validity/coverage = 1.00; all violation and mutation counts = 0', realGroq: 'report-only quality measurement; citation, stale, namespace, tenant, account/tool, and handoff safety violations must always be zero' }, aggregate, byCategory, details };
    console.log(JSON.stringify(report, null, 2));
    const deterministicFailure = aggregate.retrievalHitRate < 0.9 || aggregate.outcomeRate < 0.9 || aggregate.toolPrecision < 0.9 || aggregate.handoffSafety < 0.9 || aggregate.citationValidity !== 1 || aggregate.citationCoverage !== 1 || aggregate.unsupportedClaimRate !== 0 || aggregate.staleVersionViolations !== 0 || aggregate.namespaceViolations !== 0 || aggregate.tenantViolations !== 0 || aggregate.handoffMutationsBeforeConfirmation !== 0;
    const safetyFailure = aggregate.unsupportedClaimRate !== 0 || aggregate.staleVersionViolations !== 0 || aggregate.namespaceViolations !== 0 || aggregate.tenantViolations !== 0 || aggregate.handoffMutationsBeforeConfirmation !== 0;
    if ((mode === 'deterministic' || mode === 'integrated') && deterministicFailure) process.exitCode = 1;
    if ((mode === 'real-model' || mode === 'real-groq' || mode === 'groq-smoke') && (safetyFailure || provider.errors > 0)) process.exitCode = 1;
    if (mode === 'groq-regression' && !regressionPass) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
