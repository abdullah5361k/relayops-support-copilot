import { describe, expect, it, vi } from "vitest";
import { createApiAdapter } from "@/lib/api-adapter";
import { RelayOpsApiError } from "@/lib/contracts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = { identity: "northstar-owner", userName: "Maya Chen", userEmail: "maya@northstar.demo", role: "OWNER", organizationName: "Northstar HVAC" } as const;
const dashboard = {
  organization: { name: "Northstar HVAC", trade: "HVAC", city: "Minneapolis, MN" },
  viewer: { name: "Maya Chen", email: "maya@northstar.demo", role: "OWNER" },
  metrics: { openJobs: 1, completedThisMonth: 1, activeCustomers: 2, openTickets: 1 },
  subscription: { planName: "Growth Demo", seatsUsed: 3, seatLimit: 10, status: "ACTIVE", monthlyCents: 0, startedAt: "2026-01-01T00:00:00.000Z" },
  jobs: [], team: [], tickets: []
};

function routeFetch(overrides: Record<string, Response> = {}) {
  return vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
    const path = String(args[0]).replace("/api", "");
    if (overrides[path]) return overrides[path];
    const values: Record<string, unknown> = {
      "/demo/identities": [{ identity: "northstar-owner", label: "Maya at Northstar HVAC" }],
      "/demo/session": session,
      "/dashboard": dashboard,
      "/jobs": [], "/team": [], "/customers": [], "/subscription": dashboard.subscription, "/support/tickets": []
    };
    return json(values[path]);
  });
}

describe("API-backed RelayOps adapter", () => {
  it("loads every private API projection and preserves empty collections", async () => {
    const fetcher = routeFetch();
    const workspace = await createApiAdapter(fetcher).getWorkspace();
    expect(workspace.dashboard.organization.name).toBe("Northstar HVAC");
    expect(workspace.jobs).toEqual([]);
    expect(workspace.customers).toEqual([]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      "/api/dashboard", "/api/jobs", "/api/team", "/api/customers", "/api/subscription", "/api/support/tickets"
    ]));
    expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true);
  });

  it("surfaces a missing session distinctly from a failed request", async () => {
    const missing = createApiAdapter(routeFetch({ "/demo/session": json({ message: "Select a demo identity" }, 401) }));
    await expect(missing.getDemoSession()).rejects.toMatchObject({ status: 401 } satisfies Partial<RelayOpsApiError>);
    const failed = createApiAdapter(routeFetch({ "/jobs": json({ message: "Database unavailable" }, 503) }));
    await expect(failed.getWorkspace()).rejects.toMatchObject({ status: 503, message: "Database unavailable" });
  });

  it("creates a replacement identity session and signs out with credentials", async () => {
    const fetcher = routeFetch();
    const adapter = createApiAdapter(fetcher);
    await adapter.createDemoSession("primeflow-owner");
    await adapter.clearDemoSession();
    expect(fetcher).toHaveBeenCalledWith("/api/demo/session", expect.objectContaining({ method: "POST", body: JSON.stringify({ identity: "primeflow-owner" }), credentials: "include" }));
    expect(fetcher).toHaveBeenCalledWith("/api/demo/session", expect.objectContaining({ method: "DELETE", credentials: "include" }));
  });
});
