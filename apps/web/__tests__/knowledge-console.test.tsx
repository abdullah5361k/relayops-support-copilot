import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeConsole } from "@/components/KnowledgeConsole";

describe("KnowledgeConsole", () => {
  it("shows versions, failed runs, honest model status, and evidence search", async () => {
    const user = userEvent.setup();
    render(<KnowledgeConsole />);
    expect(await screen.findByText("Sources and versions")).toBeInTheDocument();
    expect(screen.getByText(/No model weights are downloaded/)).toBeInTheDocument();
    expect(screen.getByText(/Fixture parser could not read/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /search evidence chunks/i }), "urgent");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/Acknowledging an urgent job/)).toBeInTheDocument();
  });
});
