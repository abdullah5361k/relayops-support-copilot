export const demoIdentities = ['northstar-owner', 'primeflow-owner'] as const;
export type DemoIdentity = (typeof demoIdentities)[number];

export type JobStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface DemoIdentitySummary {
  identity: DemoIdentity;
  label: string;
}

export interface OrganizationSummary {
  name: string;
  trade: string;
  city: string;
}

export interface DashboardJob {
  id: string;
  reference: string;
  title: string;
  customerName: string;
  technicianName: string | null;
  status: JobStatus;
  scheduledFor: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  specialty: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string;
  active: boolean;
  jobCount: number;
  lastServiceAt: string | null;
}

export interface SupportTicketSummary {
  id: string;
  reference: string;
  subject: string;
  requesterName: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionSummary {
  planName: string;
  seatsUsed: number;
  seatLimit: number;
  status: string;
  monthlyCents: number;
  startedAt: string;
}

export interface DashboardData {
  organization: OrganizationSummary;
  viewer: { name: string; email: string; role: string };
  metrics: {
    openJobs: number;
    completedThisMonth: number;
    activeCustomers: number;
    openTickets: number;
  };
  subscription: SubscriptionSummary;
  jobs: DashboardJob[];
  team: TeamMember[];
  tickets: SupportTicketSummary[];
}

export interface DemoSessionResponse {
  identity: DemoIdentity;
  userName: string;
  userEmail: string;
  role: string;
  organizationName: string;
}

/**
 * Narrow, server-authorized account-tool contracts. These are not UI contracts and
 * contain no organization or user authority fields. Documentation evidence is kept
 * separate from account-tool read results.
 */
export interface SubscriptionSeatUsageResult {
  kind: 'subscription_seat_usage';
  planName: string;
  status: string;
  seatsUsed: number;
  seatLimit: number;
}

export interface JobStatusToolResult {
  kind: 'job_status';
  reference: string;
  status: JobStatus;
}

export interface SupportTicketStatusToolResult {
  kind: 'support_ticket_status';
  reference: string;
  status: TicketStatus;
}

export interface DocumentationEvidenceReference {
  sourceId: string;
  locator?: string;
}

export interface HandoffPreviewInput {
  /** Bounded user-approved question/summary, never a model instruction. */
  summary: string;
  documentationEvidence: DocumentationEvidenceReference[];
  conversationExcerpt?: string;
  /** Optional closed read plan. The server recomputes this evidence from its own tenant session. */
  accountToolPlan?: SupportAccountToolPlan;
}

export interface HandoffPreviewResult {
  kind: 'handoff_preview';
  draftId: string;
  expiresAt: string;
  shared: {
    summary: string;
    documentationEvidence: DocumentationEvidenceReference[];
    conversationExcerpt: string | null;
    accountEvidence: SupportAccountEvidence[];
  };
}

export interface HandoffConfirmationInput { draftId: string; }

export interface HandoffConfirmationResult {
  kind: 'handoff_confirmed';
  draftId: string;
  ticket: { reference: string; status: TicketStatus };
  /** False only for a same-actor retry after a committed confirmation. */
  created: boolean;
}

export interface HandoffCancellationResult {
  kind: 'handoff_cancelled';
  draftId: string;
  cancelled: boolean;
}

export type AccountToolReadResult = SubscriptionSeatUsageResult | JobStatusToolResult | SupportTicketStatusToolResult;
export type AccountToolErrorCode = 'invalid_argument' | 'not_found' | 'invalid_draft' | 'draft_expired' | 'draft_cancelled';
export interface AccountToolError { kind: 'error'; code: AccountToolErrorCode; }

/**
 * Canonical support boundary. The request never contains a tenant, actor, tool,
 * URL, corpus location, account facts, or session assertion. Those are derived
 * exclusively by the API from its HttpOnly demo session and allowlists.
 */
export type SupportAnswerState = 'ANSWERED' | 'REFUSED' | 'ERROR';
export type SupportRefusalReason =
  | 'INSUFFICIENT_EVIDENCE'
  | 'ACCOUNT_SIGN_IN_REQUIRED'
  | 'ACCOUNT_REFERENCE_UNAVAILABLE'
  | 'INVALID_MODEL_OUTPUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'RETRIEVAL_UNAVAILABLE'
  | 'CANCELLED';

export interface SupportAnswerRequest { question: string; }
export type SupportSourceType = 'html' | 'faq-json' | 'pdf' | 'docx';

/** Citation metadata is copied only from an active retrieved chunk. `anchor` is display metadata, never a URL. */
export interface SupportCitation {
  evidenceId: string;
  sourceLogicalId: string;
  sourceTitle: string;
  sourceType: SupportSourceType;
  heading: string | null;
  section: string | null;
  page: number | null;
  anchor: string | null;
  excerpt: string;
}

/** Fixed, server-selected read tools. Arguments exclude all tenant and actor authority. */
export type SupportAccountToolName = 'subscription_seat_usage' | 'job_status' | 'support_ticket_status';
export type SupportAccountToolPlan =
  | { tool: 'subscription_seat_usage'; arguments: Record<string, never> }
  | { tool: 'job_status'; arguments: { reference: string } }
  | { tool: 'support_ticket_status'; arguments: { reference: string } };

/** Account facts cannot cite documentation and documentation citations cannot represent account facts. */
export type SupportAccountEvidence =
  | { kind: 'subscription_seat_usage'; label: 'Subscription seat usage'; planName: string; status: string; seatsUsed: number; seatLimit: number }
  | { kind: 'job_status'; label: 'Job status'; reference: string; status: JobStatus }
  | { kind: 'support_ticket_status'; label: 'Support ticket status'; reference: string; status: TicketStatus };

/** Fixed server-selected provider identity. The browser cannot choose a model, URL, or credential. */
export type SupportProviderStatus =
  | { provider: 'groq'; model: 'openai/gpt-oss-20b'; available: boolean }
  | { provider: 'ollama'; model: 'qwen3:4b'; available: boolean }
  | { provider: 'disabled'; model: 'disabled'; available: boolean };

export interface SupportAnswerResponse {
  traceId: string;
  state: SupportAnswerState;
  /** Present only after server validation; token drafts are never authoritative. */
  answer: string | null;
  citations: SupportCitation[];
  accountEvidence: SupportAccountEvidence[];
  accountToolPlan: SupportAccountToolPlan | null;
  handoffAvailable: boolean;
  refusalReason: SupportRefusalReason | null;
  suggestedTopics: string[];
  provider: SupportProviderStatus;
}

/** SSE only contains lifecycle/status plus one server-validated terminal response. */
export type SupportStreamEvent =
  | { type: 'lifecycle'; traceId: string; stage: 'planning' | 'retrieving' | 'generating' | 'complete' }
  | { type: 'status'; traceId: string; provider: SupportProviderStatus }
  | { type: 'final'; response: SupportAnswerResponse }
  | { type: 'refusal'; response: SupportAnswerResponse }
  | { type: 'error'; response: SupportAnswerResponse };

export type KnowledgeSourceStatus = 'active' | 'previous' | 'failed';
export interface KnowledgeSourceSummary {
  logicalId: string; title: string; sourceType: SupportSourceType; status: KnowledgeSourceStatus;
  activeVersion: string | null; updatedAt: string; chunkCount: number;
}
export interface KnowledgeRunSummary {
  id: string; sourceLogicalId: string; status: 'completed' | 'running' | 'skipped' | 'failed';
  stage: 'queued' | 'processing' | 'complete' | 'failed'; startedAt: string; finishedAt: string | null; error: string | null;
}
export interface KnowledgeSnapshot {
  sources: KnowledgeSourceSummary[]; runs: KnowledgeRunSummary[];
  model: { name: 'Xenova/all-MiniLM-L6-v2'; status: 'ready' | 'unavailable'; cache: 'present' | 'missing'; note: string };
}
export interface KnowledgeSearchHit { citation: SupportCitation; score: number; }
export interface KnowledgeReindexRequest { logicalId?: string; }
export interface KnowledgeReindexResponse { results: Array<{ logicalId: string; status: 'ingested' | 'skipped' | 'failed' }>; runs: KnowledgeRunSummary[]; }
