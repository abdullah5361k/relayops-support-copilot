import type { Article, ChatReply, ChatScenario, RelayOpsAdapter, TenantId, TenantSummary, Workspace } from "./contracts";

const tenants: TenantSummary[] = [
  { id: "northstar", name: "Northstar HVAC", trade: "Heating & cooling", initials: "NH", plan: "Growth", location: "Boise, ID" },
  { id: "primeflow", name: "PrimeFlow Plumbing", trade: "Plumbing", initials: "PP", plan: "Starter", location: "Tacoma, WA" },
];

const articles: Article[] = [
  { slug: "invite-team-members", category: "Team management", title: "Invite your team and manage seats", summary: "Add dispatchers and technicians, understand seat limits, and remove access.", updated: "May 18, 2026", readTime: "4 min", body: ["Workspace owners and admins can invite teammates from Team. Each active member and pending invitation uses one seat until the invitation expires or is revoked.", "Open Team, choose Invite member, then enter a work email and role. RelayOps shows your current seat usage before you send the invitation.", "Growth workspaces include 8 seats. If every seat is in use, remove an unused invitation or change the subscription before inviting another member."] },
  { slug: "customer-notifications", category: "Jobs", title: "Set up customer arrival notifications", summary: "Keep customers informed with scheduled and on-the-way messages.", updated: "May 12, 2026", readTime: "3 min", body: ["Arrival notifications are optional messages connected to a scheduled job.", "Choose a job, open Notifications, and select the message timing. Preview the message before saving."] },
  { slug: "billing-cycle", category: "Billing", title: "Plans, billing cycles, and seat changes", summary: "Learn when plan and seat updates take effect.", updated: "May 8, 2026", readTime: "5 min", body: ["RelayOps plans are shown per workspace and include a fixed number of team seats.", "A plan change is previewed before confirmation. This demo does not process payments or save changes."] },
  { slug: "knowledge-publishing", category: "Support tools", title: "Publish a help article", summary: "Draft, review, and publish reliable answers for your customers.", updated: "April 29, 2026", readTime: "4 min", body: ["Knowledge admins can create drafts without making them visible to customers.", "Review title, content, and audience before publishing. Published edits appear in the help centre after the update is saved."] },
  { slug: "data-controls", category: "Security", title: "Workspace data and access controls", summary: "A plain-language overview of tenant boundaries and roles.", updated: "April 21, 2026", readTime: "6 min", body: ["RelayOps is designed around separate workspaces. Team roles determine which screens a member can access.", "This portfolio UI uses local synthetic fixtures. It does not authenticate users, persist account data, or connect to a production service."] },
];

function workspace(id: TenantId): Workspace {
  const n = id === "northstar";
  const tenant = tenants.find((item) => item.id === id)!;
  return {
    tenant,
    metrics: n
      ? [{ label: "Jobs today", value: "14", note: "3 currently in progress", trend: "up" }, { label: "Weekly revenue", value: "$18,420", note: "+8.4% from last week", trend: "up" }, { label: "First-time fix", value: "91%", note: "Across 62 completed jobs" }, { label: "Open requests", value: "7", note: "2 need dispatch" }]
      : [{ label: "Jobs today", value: "9", note: "2 currently in progress", trend: "up" }, { label: "Weekly revenue", value: "$11,860", note: "+3.1% from last week", trend: "up" }, { label: "First-time fix", value: "88%", note: "Across 41 completed jobs" }, { label: "Open requests", value: "5", note: "1 needs dispatch" }],
    jobs: n ? [
      { id: "J-1048", customer: "Marin Coffee Roasters", service: "Rooftop unit inspection", assignee: "Eli Park", time: "8:30 AM", status: "In progress" },
      { id: "J-1049", customer: "Drew & Casey Holt", service: "No-cool diagnostic", assignee: "Nina Flores", time: "10:00 AM", status: "Scheduled" },
      { id: "J-1050", customer: "Juniper Dental", service: "Filter and belt service", assignee: "Mara Singh", time: "11:30 AM", status: "Scheduled" },
      { id: "J-1046", customer: "Lumen Bookshop", service: "Thermostat replacement", assignee: "Eli Park", time: "7:15 AM", status: "Complete" },
    ] : [
      { id: "J-2081", customer: "Harbor Street Bakery", service: "Drain line repair", assignee: "Owen Reed", time: "8:00 AM", status: "In progress" },
      { id: "J-2082", customer: "Morgan Bell", service: "Water heater inspection", assignee: "Tessa Long", time: "10:30 AM", status: "Scheduled" },
      { id: "J-2083", customer: "Cedar Pet Care", service: "Fixture replacement", assignee: "Owen Reed", time: "1:00 PM", status: "Scheduled" },
    ],
    members: n ? [
      { name: "Mara Singh", role: "Owner", email: "mara@example.test", status: "Active", initials: "MS" }, { name: "Eli Park", role: "Technician", email: "eli@example.test", status: "Active", initials: "EP" }, { name: "Nina Flores", role: "Technician", email: "nina@example.test", status: "Active", initials: "NF" }, { name: "Sam Calder", role: "Dispatcher", email: "sam@example.test", status: "Active", initials: "SC" }, { name: "Iris West", role: "Technician", email: "iris@example.test", status: "Invited", initials: "IW" },
    ] : [{ name: "Tessa Long", role: "Owner", email: "tessa@example.test", status: "Active", initials: "TL" }, { name: "Owen Reed", role: "Technician", email: "owen@example.test", status: "Active", initials: "OR" }, { name: "June Cho", role: "Dispatcher", email: "june@example.test", status: "Invited", initials: "JC" }],
    customers: n ? [{ name: "Marin Coffee Roasters", address: "412 Grove Ave", lastService: "Today", jobs: 8, value: "$4,280" }, { name: "Juniper Dental", address: "88 Hillcrest Dr", lastService: "Today", jobs: 5, value: "$3,140" }, { name: "Lumen Bookshop", address: "19 Alder St", lastService: "May 17", jobs: 3, value: "$1,480" }] : [{ name: "Harbor Street Bakery", address: "270 Dock St", lastService: "Today", jobs: 6, value: "$2,860" }, { name: "Cedar Pet Care", address: "64 Cedar Way", lastService: "Today", jobs: 4, value: "$1,920" }, { name: "Morgan Bell", address: "831 Pine Ct", lastService: "Apr 28", jobs: 2, value: "$980" }],
    tickets: [{ id: n ? "RLY-284" : "RLY-316", subject: "How do I add another technician?", requester: n ? "Mara Singh" : "Tessa Long", status: "Open", updated: "12 min ago" }, { id: n ? "RLY-279" : "RLY-309", subject: "Customer notification timing", requester: n ? "Sam Calder" : "June Cho", status: "Waiting", updated: "Yesterday" }, { id: n ? "RLY-266" : "RLY-301", subject: "Export last month’s jobs", requester: n ? "Mara Singh" : "Tessa Long", status: "Resolved", updated: "May 16" }],
    knowledge: [{ title: "Spring maintenance checklist", status: "Published", category: "Service guides", updated: "Today", views: n ? 184 : 96 }, { title: "What to expect before arrival", status: "Published", category: "Customer care", updated: "May 16", views: n ? 132 : 88 }, { title: n ? "Heat pump rebate FAQ" : "Preventing frozen pipes", status: "Draft", category: "Seasonal", updated: "May 14", views: 0 }],
    subscription: { seatsUsed: n ? 8 : 3, seatsTotal: n ? 8 : 4, renewal: "June 18, 2026", amount: n ? "$129 / month" : "$69 / month", plan: tenant.plan },
    activity: [{ text: `${n ? "Eli" : "Owen"} marked a job in progress`, time: "8 minutes ago", tone: "blue" }, { text: "A new web request was received", time: "24 minutes ago", tone: "orange" }, { text: "Customer arrival message delivered", time: "41 minutes ago", tone: "green" }],
  };
}

const replies: Record<ChatScenario, Omit<ChatReply, "scenario">> = {
  public: { state: "success", answer: "You can invite a teammate from Team → Invite member. Choose their role, review current seat usage, and send the invitation. Pending invitations count toward your seat limit.", evidence: [{ type: "documentation", label: "Invite your team and manage seats", detail: "Team management · Updated May 18, 2026", href: "/help/invite-team-members" }] },
  seats: { state: "success", answer: "Northstar HVAC is currently using all 8 seats included with its Growth plan. The invitation cannot be sent until an unused invitation is revoked or the plan is changed. I have not made any account changes.", evidence: [{ type: "documentation", label: "Invite your team and manage seats", detail: "Growth includes 8 team seats", href: "/help/invite-team-members" }, { type: "account", label: "Northstar HVAC · Subscription", detail: "8 of 8 seats currently in use" }] },
  refusal: { state: "refusal", answer: "I can’t reveal another workspace’s customer or billing information. I can only help with public documentation and the selected demo workspace.", evidence: [] },
  handoff: { state: "handoff", answer: "Your simulated support request has been prepared. A support teammate would follow up by email. No real ticket was created or sent.", evidence: [{ type: "account", label: "Demo handoff record", detail: "Priority: normal · Contact: workspace owner" }], ticketId: "RLY-DEMO-482" },
  error: { state: "error", answer: "The simulated request could not be completed. Your message was not sent. Please try another demo state.", evidence: [] },
  quota: { state: "unavailable", answer: "This demo workspace has reached its simulated free support quota. Help-centre articles remain available.", evidence: [{ type: "documentation", label: "Browse the help centre", detail: "Public guides remain available", href: "/help" }] },
  unavailable: { state: "unavailable", answer: "Account-aware support is temporarily unavailable in this simulated state. No account data was accessed.", evidence: [] },
};

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
export const mockAdapter: RelayOpsAdapter = {
  async listTenants() { await delay(); return structuredClone(tenants); },
  async getWorkspace(tenantId) { await delay(); return structuredClone(workspace(tenantId)); },
  async listArticles() { await delay(); return structuredClone(articles); },
  async getArticle(slug) { await delay(); return structuredClone(articles.find((a) => a.slug === slug) ?? null); },
  async askSupport(_input, _tenantId, scenario = "public") { await delay(650); return { scenario, ...structuredClone(replies[scenario]) }; },
};
