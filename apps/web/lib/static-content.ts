import type { Article, ChatReply, ChatScenario, KnowledgeItem } from "./contracts";

/**
 * Explicitly local public help content for surfaces not backed by the API yet.
 * The deprecated reply helper below exists only for compatibility with the
 * original unit test; application support uses the same-origin live RagClient.
 * Nothing in this file is private tenant business data, retrieved evidence, or a live AI response.
 */
export const staticArticles: Article[] = [
  { slug: "invite-team-members", category: "Team management", title: "Invite your team and manage seats", summary: "Preview how team invitations and seat limits could work.", updated: "May 18, 2026", readTime: "4 min", body: ["This prewritten guide illustrates a future team invitation workflow. The integrated demo currently provides read-only team and seat data.", "The database-backed Team and Subscription screens show the active synthetic membership count. Invitations and plan changes are not implemented.", "No payment, email, or account mutation occurs anywhere in this demonstration."] },
  { slug: "customer-notifications", category: "Jobs", title: "Set up customer arrival notifications", summary: "A static preview of scheduled and on-the-way messages.", updated: "May 12, 2026", readTime: "3 min", body: ["Arrival notifications are demonstration documentation only.", "The integrated demo reads jobs from PostgreSQL but does not send or persist notifications."] },
  { slug: "billing-cycle", category: "Billing", title: "Plans, billing cycles, and seat changes", summary: "Understand the fictional plan data shown in the demo.", updated: "May 8, 2026", readTime: "5 min", body: ["Plans shown in RelayOps are synthetic database records and never trigger billing.", "Plan changes, invoices, charges, and payment methods are not implemented."] },
  { slug: "knowledge-publishing", category: "Support tools", title: "Publish a help article", summary: "A static preview of a future review and publishing workflow.", updated: "April 29, 2026", readTime: "4 min", body: ["The owner Knowledge console inspects committed local source/version/run/search state.", "Draft edits and arbitrary publishing are not implemented; only committed-manifest reindex is available."] },
  { slug: "data-controls", category: "Security", title: "Workspace data and access controls", summary: "How the integrated demo keeps its synthetic tenants separate.", updated: "April 21, 2026", readTime: "6 min", body: ["Private dashboard data comes from the local API and PostgreSQL database. Tenant context is derived from an allowlisted HttpOnly demo-session cookie.", "Browser-provided organization IDs are never accepted as authority. This boundary is demo authentication, not production authentication."] }
];

export const staticKnowledge: KnowledgeItem[] = [
  { title: "Example maintenance checklist", status: "Published", category: "Static demo content", updated: "Local fixture", views: 0 },
  { title: "What to expect before arrival", status: "Published", category: "Static demo content", updated: "Local fixture", views: 0 },
  { title: "Seasonal service draft", status: "Draft", category: "Static demo content", updated: "Local fixture", views: 0 }
];

const replies: Record<ChatScenario, Omit<ChatReply, "scenario">> = {
  public: { state: "success", answer: "This is a prewritten demonstration answer. The future workflow could invite a teammate from Team, but invitations are not implemented in this milestone.", evidence: [{ type: "documentation", label: "Invite your team and manage seats", detail: "Static demonstration article · not retrieved by RAG", href: "/help/invite-team-members" }] },
  seats: { state: "success", answer: "This is a prewritten account-aware UI example. It did not query account tools or make changes. Use the database-backed Subscription screen for the current synthetic seat count.", evidence: [{ type: "documentation", label: "Invite your team and manage seats", detail: "Static demonstration article · not a live citation", href: "/help/invite-team-members" }, { type: "account", label: "Illustrative account evidence", detail: "Prewritten UI state · not fetched by chat" }] },
  refusal: { state: "refusal", answer: "This simulated response refuses requests for another workspace. The real dashboard API separately enforces tenant scope for every private query.", evidence: [] },
  handoff: { state: "handoff", answer: "A simulated support request has been prepared. No real ticket was created, persisted, or sent.", evidence: [{ type: "account", label: "Illustrative handoff record", detail: "Prewritten state · no backend mutation" }], ticketId: "RLY-DEMO-482" },
  error: { state: "error", answer: "This is a prewritten request-error state. No message was sent.", evidence: [] },
  quota: { state: "unavailable", answer: "This is a prewritten quota state. No live support or AI quota exists.", evidence: [{ type: "documentation", label: "Browse static help content", detail: "Local demonstration articles", href: "/help" }] },
  unavailable: { state: "unavailable", answer: "This prewritten state demonstrates account tools being unavailable. No account tool or AI runtime exists yet.", evidence: [] }
};

const delay = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
export async function listStaticArticles() { return structuredClone(staticArticles); }
export async function getStaticArticle(slug: string) { return structuredClone(staticArticles.find((article) => article.slug === slug) ?? null); }
export async function getStaticSupportReply(scenario: ChatScenario = "public") {
  await delay(400);
  return { scenario, ...structuredClone(replies[scenario]) };
}
