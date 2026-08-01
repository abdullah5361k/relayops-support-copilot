/**
 * UI-local seam for the future grounded-answer service.
 *
 * The browser sends a question and optional development fixture selector only.
 * It never sends an organization identifier or treats one as authority.
 */
export type RagPhase = "pending" | "retrieving" | "generating";
export type RagScenario =
  | "answer"
  | "account"
  | "refusal"
  | "handoff"
  | "model-loading"
  | "unavailable"
  | "timeout"
  | "quota"
  | "malformed"
  | "network";

export type Citation = {
  id: string;
  title: string;
  sourceType: "help-article" | "runbook" | "public-guide";
  heading?: string;
  page?: number;
  anchor?: string;
  href?: string;
  excerpt?: string;
};

export type AccountEvidence = {
  id: string;
  label: string;
  value: string;
  reason: string;
  authRequired: boolean;
  source: "workspace-tool" | "support-ticket" | "subscription" | "job";
};

export type RagErrorCode =
  | "provider-unavailable"
  | "model-loading"
  | "timeout"
  | "resource-exhausted"
  | "malformed-response"
  | "network-loss"
  | "cancelled";

export type RagStreamEvent =
  | { type: "started"; requestId: string }
  | { type: "phase"; phase: RagPhase; label: string }
  | { type: "delta"; text: string }
  | { type: "final"; answer: string; citations: Citation[]; accountEvidence?: AccountEvidence[]; handoffAvailable?: boolean }
  | { type: "refusal"; reason: "insufficient-evidence" | "unsupported-scope"; message: string; suggestedAction: string }
  | { type: "error"; code: RagErrorCode; message: string; retryable: boolean }
  | { type: "cancelled"; message: string }
  | { type: "ended" };

export type RagAnswerRequest = { question: string; scenario?: RagScenario };

export type HandoffShare = {
  question: string;
  transcript: string[];
  citations: Citation[];
  accountEvidence: AccountEvidence[];
};
export type HandoffPreview = {
  previewId: string;
  expiresAt: string;
  share: HandoffShare;
};
export type HandoffResult = { ticketReference: string; createdAt: string; message: string };

export type KnowledgeSource = {
  id: string;
  title: string;
  sourceType: "public-guide" | "runbook";
  status: "active" | "previous";
  version: string;
  updatedAt: string;
  origin: string;
  chunkCount: number;
};
export type KnowledgeRun = {
  id: string;
  sourceId: string;
  status: "completed" | "running" | "failed";
  stage: "queued" | "parsing" | "chunking" | "embedding" | "activating" | "complete" | "failed";
  startedAt: string;
  finishedAt?: string;
  error?: string;
};
export type KnowledgeSearchHit = { sourceId: string; title: string; heading: string; chunk: string; score: number; page?: number; anchor?: string };
export type KnowledgeSnapshot = {
  sources: KnowledgeSource[];
  runs: KnowledgeRun[];
  model: { name: string; status: "ready" | "loading" | "unavailable"; cache: "present" | "missing"; note: string };
};

export interface RagClient {
  streamAnswer(request: RagAnswerRequest, signal?: AbortSignal): AsyncIterable<RagStreamEvent>;
  previewHandoff(input: { question: string; transcript: string[]; citations: Citation[]; accountEvidence: AccountEvidence[] }): Promise<HandoffPreview>;
  confirmHandoff(previewId: string): Promise<HandoffResult>;
  cancelHandoff(previewId: string): Promise<void>;
  getKnowledge(): Promise<KnowledgeSnapshot>;
  searchKnowledge(query: string): Promise<KnowledgeSearchHit[]>;
  reindexKnowledge(sourceId: string): Promise<KnowledgeRun>;
}

export function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Citation;
  return typeof candidate.id === "string" && typeof candidate.title === "string" &&
    ["help-article", "runbook", "public-guide"].includes(candidate.sourceType);
}
