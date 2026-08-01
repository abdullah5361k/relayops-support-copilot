export type TenantId = "northstar" | "primeflow";
export type Section = "overview" | "jobs" | "team" | "customers" | "subscription" | "support" | "knowledge";

export interface TenantSummary {
  id: TenantId;
  name: string;
  trade: string;
  initials: string;
  plan: string;
  location: string;
}
export interface Metric { label: string; value: string; note: string; trend?: "up" | "neutral" }
export interface Job { id: string; customer: string; service: string; assignee: string; time: string; status: "Scheduled" | "In progress" | "Complete" }
export interface Member { name: string; role: string; email: string; status: "Active" | "Invited"; initials: string }
export interface Customer { name: string; address: string; lastService: string; jobs: number; value: string }
export interface Ticket { id: string; subject: string; requester: string; status: "Open" | "Waiting" | "Resolved"; updated: string }
export interface Article { slug: string; category: string; title: string; summary: string; updated: string; readTime: string; body: string[] }
export interface KnowledgeItem { title: string; status: "Published" | "Draft"; category: string; updated: string; views: number }
export interface Workspace {
  tenant: TenantSummary;
  metrics: Metric[];
  jobs: Job[];
  members: Member[];
  customers: Customer[];
  tickets: Ticket[];
  knowledge: KnowledgeItem[];
  subscription: { seatsUsed: number; seatsTotal: number; renewal: string; amount: string; plan: string };
  activity: { text: string; time: string; tone: string }[];
}
export type ChatScenario = "public" | "seats" | "refusal" | "handoff" | "error" | "quota" | "unavailable";
export type Evidence = { type: "documentation" | "account"; label: string; detail: string; href?: string };
export interface ChatReply {
  scenario: ChatScenario;
  answer: string;
  evidence: Evidence[];
  ticketId?: string;
  state: "success" | "refusal" | "handoff" | "error" | "unavailable";
}
export interface RelayOpsAdapter {
  listTenants(): Promise<TenantSummary[]>;
  getWorkspace(tenantId: TenantId): Promise<Workspace>;
  listArticles(): Promise<Article[]>;
  getArticle(slug: string): Promise<Article | null>;
  askSupport(input: string, tenantId: TenantId | null, scenario?: ChatScenario): Promise<ChatReply>;
}
