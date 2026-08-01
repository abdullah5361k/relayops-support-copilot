import type {
  AccountEvidence, Citation, HandoffPreview, HandoffResult, KnowledgeRun, KnowledgeSearchHit,
  KnowledgeSnapshot, RagClient, RagErrorCode, RagScenario, RagStreamEvent
} from "./rag-contracts";

const previewStore = new Map<string, HandoffPreview>();
const citation: Citation = {
  id: "invite-team-v1",
  title: "Invite your team and manage seats",
  sourceType: "public-guide",
  heading: "How it works",
  page: 1,
  anchor: "manage-seats",
  href: "/help/invite-team-members",
  excerpt: "Each active member and pending invitation uses one seat."
};
const accountEvidence: AccountEvidence = {
  id: "seat-usage",
  label: "Current seat usage",
  value: "3 of 10 seats used",
  reason: "Included only because this preview request demonstrates account evidence.",
  authRequired: true,
  source: "subscription"
};
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorFor: Record<Exclude<RagScenario, "answer" | "account" | "refusal" | "handoff">, { code: RagErrorCode; message: string; retryable: boolean }> = {
  "model-loading": { code: "model-loading", message: "The local model is still loading. Try again shortly.", retryable: true },
  unavailable: { code: "provider-unavailable", message: "The local answer provider is unavailable in this preview.", retryable: true },
  timeout: { code: "timeout", message: "The answer provider timed out before it could validate an answer.", retryable: true },
  quota: { code: "resource-exhausted", message: "The free local resource allowance is exhausted for this preview.", retryable: true },
  malformed: { code: "malformed-response", message: "The provider returned an invalid event order. No answer was validated.", retryable: true },
  network: { code: "network-loss", message: "The stream disconnected before validation. No answer was accepted.", retryable: true }
};

export class MockRagClient implements RagClient {
  async *streamAnswer({ question, scenario = "answer" }: { question: string; scenario?: RagScenario }, signal?: AbortSignal): AsyncIterable<RagStreamEvent> {
    const requestId = `mock-${question.length}-${scenario}`;
    if (scenario === "malformed") {
      yield { type: "delta", text: "Unvalidated text that must not remain visible." };
      yield { type: "error", ...errorFor.malformed };
      return;
    }
    yield { type: "started", requestId };
    for (const [phase, label] of [["pending", "Request accepted"], ["retrieving", "Checking public evidence"], ["generating", "Preparing a draft"]] as const) {
      if (signal?.aborted) { yield { type: "cancelled", message: "Request cancelled." }; return; }
      yield { type: "phase", phase, label };
      await sleep(35);
    }
    if (scenario in errorFor) {
      if (signal?.aborted) { yield { type: "cancelled", message: "Request cancelled." }; return; }
      yield { type: "error", ...errorFor[scenario as Exclude<RagScenario, "answer" | "account" | "refusal" | "handoff">] };
      return;
    }
    if (scenario === "refusal") {
      yield { type: "refusal", reason: question.toLowerCase().includes("other") ? "unsupported-scope" : "insufficient-evidence", message: "I can’t provide that as a grounded answer because the available public evidence does not support it.", suggestedAction: "Try a question about RelayOps help content, or ask for a human handoff." };
      yield { type: "ended" };
      return;
    }
    const answer = scenario === "account"
      ? "Your workspace is using 3 of 10 seats. This private account fact is shown separately and requires an authenticated workspace session."
      : scenario === "handoff"
        ? "I could not resolve this from the available evidence. I can prepare a support handoff for your review."
        : "Open Team, choose Invite member, and select a role. Pending invitations use a seat.";
    for (const text of answer.match(/.{1,24}(?:\s|$)/g) ?? [answer]) {
      if (signal?.aborted) { yield { type: "cancelled", message: "Request cancelled." }; return; }
      yield { type: "delta", text };
      await sleep(22);
    }
    yield {
      type: "final",
      answer,
      citations: scenario === "account" ? [citation] : [citation],
      accountEvidence: scenario === "account" ? [accountEvidence] : [],
      handoffAvailable: scenario === "handoff"
    };
    yield { type: "ended" };
  }

  async previewHandoff(input: { question: string; transcript: string[]; citations: Citation[]; accountEvidence: AccountEvidence[] }): Promise<HandoffPreview> {
    await sleep(30);
    const preview: HandoffPreview = {
      previewId: `preview-${input.question.length}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      share: structuredClone(input)
    };
    previewStore.set(preview.previewId, preview);
    return structuredClone(preview);
  }
  async confirmHandoff(previewId: string): Promise<HandoffResult> {
    await sleep(35);
    const preview = previewStore.get(previewId);
    if (!preview || Date.parse(preview.expiresAt) <= Date.now()) { previewStore.delete(previewId); throw new Error("This handoff preview expired or was already used."); }
    previewStore.delete(previewId);
    return { ticketReference: "RLY-DEMO-482", createdAt: new Date().toISOString(), message: "Synthetic preview ticket created after explicit confirmation." };
  }
  async cancelHandoff(previewId: string) { previewStore.delete(previewId); await sleep(10); }

  async getKnowledge(): Promise<KnowledgeSnapshot> {
    await sleep(20);
    return structuredClone(knowledge);
  }
  async searchKnowledge(query: string): Promise<KnowledgeSearchHit[]> {
    await sleep(20);
    if (!query.trim()) return [];
    return structuredClone(knowledgeHits.filter((hit) => `${hit.title} ${hit.heading} ${hit.chunk}`.toLowerCase().includes(query.toLowerCase())));
  }
  async reindexKnowledge(sourceId: string): Promise<KnowledgeRun> {
    await sleep(30);
    return { id: `run-${sourceId}-mock`, sourceId, status: "running", stage: "queued", startedAt: new Date().toISOString() };
  }
}

const knowledge: KnowledgeSnapshot = {
  sources: [
    { id: "dispatch-basics", title: "Dispatch basics", sourceType: "public-guide", status: "active", version: "v2", updatedAt: "2026-05-18T10:00:00Z", origin: "Committed public corpus fixture", chunkCount: 18 },
    { id: "dispatch-basics-v1", title: "Dispatch basics", sourceType: "public-guide", status: "previous", version: "v1", updatedAt: "2026-04-22T10:00:00Z", origin: "Committed public corpus fixture", chunkCount: 17 },
    { id: "incident-response", title: "Incident response", sourceType: "runbook", status: "active", version: "v1", updatedAt: "2026-05-12T10:00:00Z", origin: "Committed public corpus fixture", chunkCount: 12 }
  ],
  runs: [
    { id: "run-dispatch-basics-v2", sourceId: "dispatch-basics", status: "completed", stage: "complete", startedAt: "2026-05-18T09:40:00Z", finishedAt: "2026-05-18T10:00:00Z" },
    { id: "run-incident-response-v1", sourceId: "incident-response", status: "failed", stage: "failed", startedAt: "2026-05-12T09:40:00Z", finishedAt: "2026-05-12T09:43:00Z", error: "Fixture parser could not read one optional page marker." }
  ],
  model: { name: "Local embedding model (preview)", status: "unavailable", cache: "missing", note: "No model weights are downloaded by this UI fixture." }
};
const knowledgeHits: KnowledgeSearchHit[] = [
  { sourceId: "dispatch-basics", title: "Dispatch basics", heading: "Acknowledging an urgent job", chunk: "A dispatcher should acknowledge an urgent job before assigning the next available technician.", score: 0.94, page: 2, anchor: "urgent-job" },
  { sourceId: "incident-response", title: "Incident response", heading: "Escalation notes", chunk: "Record the customer-visible impact and the next review point in the incident notes.", score: 0.81, anchor: "escalation" }
];

export const mockRagClient: RagClient = new MockRagClient();
export const ragClient = mockRagClient;
