import type {
  CustomerSummary,
  DashboardData,
  DashboardJob,
  DemoIdentity,
  DemoIdentitySummary,
  DemoSessionResponse,
  SubscriptionSummary,
  SupportTicketSummary,
  TeamMember
} from "@relayops/contracts";
import type { RagClient } from "./rag-contracts";

export type { DemoIdentity, DemoIdentitySummary, DemoSessionResponse } from "@relayops/contracts";
export type Section = "overview" | "jobs" | "team" | "customers" | "subscription" | "support" | "knowledge";

export interface Article { slug: string; category: string; title: string; summary: string; updated: string; readTime: string; body: string[] }
export interface KnowledgeItem { title: string; status: "Published" | "Draft"; category: string; updated: string; views: number }
export type ChatScenario = "public" | "seats" | "refusal" | "handoff" | "error" | "quota" | "unavailable";
export type Evidence = { type: "documentation" | "account"; label: string; detail: string; href?: string };
export interface ChatReply {
  scenario: ChatScenario;
  answer: string;
  evidence: Evidence[];
  ticketId?: string;
  state: "success" | "refusal" | "handoff" | "error" | "unavailable";
}

export interface Workspace {
  dashboard: DashboardData;
  jobs: DashboardJob[];
  members: TeamMember[];
  customers: CustomerSummary[];
  tickets: SupportTicketSummary[];
  subscription: SubscriptionSummary;
  knowledge: KnowledgeItem[];
}

export class RelayOpsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RelayOpsApiError";
  }
}

export interface RelayOpsAdapter {
  listDemoIdentities(): Promise<DemoIdentitySummary[]>;
  createDemoSession(identity: DemoIdentity): Promise<DemoSessionResponse>;
  getDemoSession(): Promise<DemoSessionResponse>;
  clearDemoSession(): Promise<void>;
  getWorkspace(): Promise<Workspace>;
  listArticles(): Promise<Article[]>;
  getArticle(slug: string): Promise<Article | null>;
  /** Same-origin validated support/Knowledge boundary. */
  support: RagClient;
}
