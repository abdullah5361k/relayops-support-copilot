import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return {
  replace,
  router: { replace },
  service: {
    getDemoSession: vi.fn(), getWorkspace: vi.fn(), listDemoIdentities: vi.fn(),
    createDemoSession: vi.fn(), clearDemoSession: vi.fn()
  }
};
});
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/overview", useRouter: () => mocks.router }));
vi.mock("@/lib/service", () => ({ relayOpsService: mocks.service }));

import { DashboardShell } from "@/components/DashboardShell";
import { RelayOpsApiError } from "@/lib/contracts";

const northSession = { identity: "northstar-owner", userName: "Maya Chen", userEmail: "maya@northstar.demo", role: "OWNER", organizationName: "Northstar HVAC" };
const primeSession = { identity: "primeflow-owner", userName: "Sofia Ramirez", userEmail: "sofia@primeflow.demo", role: "OWNER", organizationName: "PrimeFlow Plumbing" };
const subscription = { planName: "Growth Demo", seatsUsed: 3, seatLimit: 10, status: "ACTIVE", monthlyCents: 0, startedAt: "2026-01-01T00:00:00.000Z" };
const workspace = { dashboard: { organization: { name: "Northstar HVAC", trade: "HVAC", city: "Minneapolis, MN" }, viewer: { name: "Maya Chen", email: "maya@northstar.demo", role: "OWNER" }, metrics: { openJobs: 0, completedThisMonth: 0, activeCustomers: 0, openTickets: 0 }, subscription, jobs: [], team: [], tickets: [] }, jobs: [], members: [], customers: [], tickets: [], subscription, knowledge: [] };
const identities = [{ identity: "northstar-owner", label: "Maya at Northstar HVAC" }, { identity: "primeflow-owner", label: "Sofia at PrimeFlow Plumbing" }];

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.service.getDemoSession.mockResolvedValue(northSession);
  mocks.service.getWorkspace.mockResolvedValue(workspace);
  mocks.service.listDemoIdentities.mockResolvedValue(identities);
  mocks.service.createDemoSession.mockResolvedValue(primeSession);
  mocks.service.clearDemoSession.mockResolvedValue(undefined);
});

describe("dashboard session journey", () => {
  it("returns a missing session to demo entry without rendering private records", async () => {
    mocks.service.getDemoSession.mockRejectedValue(new RelayOpsApiError(401, "Expired"));
    render(<DashboardShell />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/demo"));
    expect(screen.queryByText("Northstar HVAC")).not.toBeInTheDocument();
  });

  it("shows an API failure and retries successfully", async () => {
    mocks.service.getDemoSession.mockRejectedValueOnce(new RelayOpsApiError(503, "API offline")).mockResolvedValue(northSession);
    const user = userEvent.setup(); render(<DashboardShell />);
    expect(await screen.findByText("Workspace unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Good morning, Maya")).toBeInTheDocument();
    expect(mocks.service.getDemoSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("replaces the server session when switching and deletes it on sign-out", async () => {
    const user = userEvent.setup(); render(<DashboardShell />);
    await screen.findByText("Good morning, Maya");
    await user.click(screen.getByRole("button", { name: /Northstar HVAC/i }));
    await user.click(screen.getByRole("button", { name: /Sofia at PrimeFlow Plumbing/i }));
    await waitFor(() => expect(mocks.service.createDemoSession).toHaveBeenCalledWith("primeflow-owner"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.service.clearDemoSession).toHaveBeenCalled());
    expect(mocks.replace).toHaveBeenCalledWith("/demo");
  });
});
