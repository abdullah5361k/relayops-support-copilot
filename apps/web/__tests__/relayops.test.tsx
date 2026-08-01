import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getStaticSupportReply, listStaticArticles } from "@/lib/static-content";
import { SupportChat } from "@/components/SupportChat";

describe("explicit static demonstration content", () => {
  it("labels documentation and illustrative account evidence separately", async () => {
    const reply = await getStaticSupportReply("seats");
    expect(reply.evidence.map((item) => item.type)).toEqual(["documentation", "account"]);
    expect(reply.answer).toContain("prewritten account-aware UI example");
    expect((await listStaticArticles()).every((article) => article.body.join(" ").match(/not |demo|synthetic|future/i))).toBe(true);
  });
});

describe("SupportChat", () => {
  it("opens, renders an honestly labeled static article link, and closes", async () => {
    const user = userEvent.setup();
    render(<SupportChat />);
    await user.click(screen.getByRole("button", { name: /open simulated support chat/i }));
    await user.click(screen.getByRole("button", { name: /how do i invite a technician/i }));
    expect(screen.getByLabelText(/loading simulated answer/i)).toBeInTheDocument();
    expect(await screen.findByText("Static documentation link", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /invite your team and manage seats/i })).toHaveAttribute("href", "/help/invite-team-members");
    expect(screen.getByText(/no ai, rag, live citation/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close support chat/i }));
    expect(screen.getByRole("button", { name: /open simulated support chat/i })).toBeInTheDocument();
  });
});
