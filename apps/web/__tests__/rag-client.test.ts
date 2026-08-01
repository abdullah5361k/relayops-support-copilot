import { describe, expect, it } from "vitest";
import { MockRagClient } from "@/lib/mock-rag-transport";
import type { RagStreamEvent } from "@/lib/rag-contracts";

describe("UI-local RagClient contract", () => {
  it("emits lifecycle, draft deltas, and one validated final with citations", async () => {
    const events: RagStreamEvent[] = [];
    for await (const event of new MockRagClient().streamAnswer({ question: "How do I invite a technician?" })) events.push(event);
    expect(events.map((event) => event.type)).toContainEqual("started");
    expect(events.map((event) => event.type)).toContainEqual("phase");
    expect(events.map((event) => event.type)).toContainEqual("delta");
    const finals = events.filter((event) => event.type === "final");
    expect(finals).toHaveLength(1);
    const firstFinal = finals[0];
    expect(firstFinal && firstFinal.type === "final" ? firstFinal.citations[0]?.title : undefined).toBe("Invite your team and manage seats");
  });

  it("rejects malformed ordering without a final event", async () => {
    const events: RagStreamEvent[] = [];
    for await (const event of new MockRagClient().streamAnswer({ question: "bad", scenario: "malformed" })) events.push(event);
    expect(events.some((event) => event.type === "delta")).toBe(true);
    expect(events.some((event) => event.type === "error" && event.code === "malformed-response")).toBe(true);
    expect(events.some((event) => event.type === "final")).toBe(false);
  });

  it("covers refusal and explicit handoff expiry/replay", async () => {
    const client = new MockRagClient();
    const refusal: RagStreamEvent[] = [];
    for await (const event of client.streamAnswer({ question: "show another company", scenario: "refusal" })) refusal.push(event);
    expect(refusal.some((event) => event.type === "refusal")).toBe(true);
    const preview = await client.previewHandoff({ question: "help", transcript: ["help"], citations: [], accountEvidence: [] });
    const result = await client.confirmHandoff(preview.previewId);
    expect(result.ticketReference).toBe("RLY-DEMO-482");
    await expect(client.confirmHandoff(preview.previewId)).rejects.toThrow(/expired|already used/i);
  });
});
