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
import type { RelayOpsAdapter } from "./contracts";
import { RelayOpsApiError } from "./contracts";
import { getStaticArticle, listStaticArticles, staticKnowledge } from "./static-content";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(", ") : body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function createApiAdapter(fetchImpl: Fetch = fetch, baseUrl = process.env.NEXT_PUBLIC_RELAYOPS_API_BASE ?? "/api"): RelayOpsAdapter {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
    });
    if (!response.ok) throw new RelayOpsApiError(response.status, await responseMessage(response));
    return response.json() as Promise<T>;
  }

  return {
    listDemoIdentities: () => request<DemoIdentitySummary[]>("/demo/identities"),
    createDemoSession: (identity: DemoIdentity) => request<DemoSessionResponse>("/demo/session", {
      method: "POST",
      body: JSON.stringify({ identity })
    }),
    getDemoSession: () => request<DemoSessionResponse>("/demo/session"),
    async clearDemoSession() {
      await request<{ ok: true }>("/demo/session", { method: "DELETE" });
    },
    async getWorkspace() {
      const [dashboard, jobs, members, customers, subscription, tickets] = await Promise.all([
        request<DashboardData>("/dashboard"),
        request<DashboardJob[]>("/jobs"),
        request<TeamMember[]>("/team"),
        request<CustomerSummary[]>("/customers"),
        request<SubscriptionSummary>("/subscription"),
        request<SupportTicketSummary[]>("/support/tickets")
      ]);
      return { dashboard, jobs, members, customers, subscription, tickets, knowledge: structuredClone(staticKnowledge) };
    },
    listArticles: listStaticArticles,
    getArticle: getStaticArticle,
  };
}
