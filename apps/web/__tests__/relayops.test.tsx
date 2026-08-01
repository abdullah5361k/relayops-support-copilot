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
  it("opens the same-origin local support surface and closes", async () => {
    const user = userEvent.setup();
    render(<SupportChat />);
    await user.click(screen.getByRole("button", { name: /open relay support/i }));
    expect(screen.getByText(/local evidence and optional local qwen/i)).toBeInTheDocument();
    expect(screen.getByText(/answers are accepted only after/i)).toBeInTheDocument();
    expect(screen.getByText(/fictional demo/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close support chat/i }));
    expect(screen.getByRole("button", { name: /open relay support/i })).toBeInTheDocument();
  });
});
