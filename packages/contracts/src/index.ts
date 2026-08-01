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
  summary: string;
  documentationEvidence: DocumentationEvidenceReference[];
  conversationExcerpt?: string;
}

export interface HandoffPreviewResult {
  kind: 'handoff_preview';
  draftId: string;
  expiresAt: string;
  shared: {
    summary: string;
    documentationEvidence: DocumentationEvidenceReference[];
    conversationExcerpt: string | null;
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

/** Public-corpus support generation contracts. Session details, if present, are server-owned. */
export type SupportAnswerState = 'ANSWERED' | 'REFUSED' | 'ERROR';
export type SupportRefusalReason =
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNSUPPORTED_GENERATION'
  | 'INVALID_MODEL_OUTPUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'RETRIEVAL_UNAVAILABLE'
  | 'CANCELLED';

export interface SupportAnswerRequest {
  question: string;
  /** Reserved for a future server-derived session context. Callers must not supply account data. */
  session?: { authenticated: boolean; extension?: Record<string, never> };
}

export interface SupportCitation {
  evidenceId: string;
  sourceLogicalId: string;
  sourceTitle: string;
  heading: string | null;
  section: string | null;
  page: number | null;
  anchor: string | null;
}

export interface SupportProviderStatus {
  provider: 'ollama';
  model: 'qwen3:4b';
  available: boolean;
}

export interface SupportAnswerResponse {
  traceId: string;
  state: SupportAnswerState;
  answer: string | null;
  citations: SupportCitation[];
  refusalReason: SupportRefusalReason | null;
  suggestedTopics: string[];
  provider: SupportProviderStatus;
  /** Intentionally empty: account-tool and handoff use their separately authorized contracts. */
  extension: Record<string, never>;
}

export type SupportStreamEvent =
  | { type: 'lifecycle'; traceId: string; stage: 'retrieving' | 'generating' | 'complete' }
  | { type: 'status'; traceId: string; provider: SupportProviderStatus }
  | { type: 'answer'; traceId: string; answer: string }
  | { type: 'citations'; traceId: string; citations: SupportCitation[] }
  | { type: 'refusal'; traceId: string; reason: SupportRefusalReason; suggestedTopics: string[] }
  | { type: 'error'; traceId: string; reason: SupportRefusalReason; message: string };
