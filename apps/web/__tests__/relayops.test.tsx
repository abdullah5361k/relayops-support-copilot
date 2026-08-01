import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAdapter } from "@/lib/mock-adapter";
import { SupportChat } from "@/components/SupportChat";

describe("RelayOps mock adapter", () => {
  it("keeps tenant workspaces deterministic and distinct", async () => {
    const tenants = await mockAdapter.listTenants();
    expect(tenants.map((tenant) => tenant.name)).toEqual(["Northstar HVAC", "PrimeFlow Plumbing"]);
    const [northstarTenant, primeflowTenant] = tenants;
    if (!northstarTenant || !primeflowTenant) throw new Error("Expected both demo tenants");
    const [northstar, primeflow] = await Promise.all([mockAdapter.getWorkspace(northstarTenant.id), mockAdapter.getWorkspace(primeflowTenant.id)]);
    expect(northstar.subscription.seatsUsed).toBe(northstar.subscription.seatsTotal);
    expect(primeflow.tenant.name).not.toBe(northstar.tenant.name);
    expect(northstar.customers.at(0)?.name).not.toBe(primeflow.customers.at(0)?.name);
  });
  it("labels documentation and account evidence separately", async () => {
    const reply = await mockAdapter.askSupport("Why can’t I add a seat?", "northstar", "seats");
    expect(reply.evidence.map((item) => item.type)).toEqual(["documentation", "account"]);
    expect(reply.answer).toContain("I have not made any account changes");
  });
});

describe("SupportChat", () => {
  it("opens, renders a cited answer, and can be closed", async () => {
    const user = userEvent.setup();
    render(<SupportChat />);
    await user.click(screen.getByRole("button", { name: /open simulated support chat/i }));
    await user.click(screen.getByRole("button", { name: /how do i invite a technician/i }));
    expect(screen.getByLabelText(/loading simulated answer/i)).toBeInTheDocument();
    expect(await screen.findByText("Documentation", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /invite your team and manage seats/i })).toHaveAttribute("href", "/help/invite-team-members");
    await user.click(screen.getByRole("button", { name: /close support chat/i }));
    expect(screen.getByRole("button", { name: /open simulated support chat/i })).toBeInTheDocument();
  });
});
