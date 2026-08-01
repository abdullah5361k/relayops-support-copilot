import { describe, expect, it } from 'vitest';
import { MockRagClient } from '@/lib/mock-rag-transport';
import type { RagStreamEvent } from '@/lib/rag-contracts';

describe('RagClient test fixture contract', () => {
  it('emits lifecycle and one server-shaped validated final', async () => {
    const events: RagStreamEvent[] = [];
    for await (const event of new MockRagClient().streamAnswer({ question: 'How do I acknowledge an urgent job?' })) events.push(event);
    expect(events.map((event) => event.type)).toContain('started');
    const final = events.find((event) => event.type === 'final');
    expect(final?.type === 'final' ? final.response.citations[0]?.sourceTitle : undefined).toBe('Dispatch basics');
  });
  it('keeps malformed fixture output terminal without a final answer', async () => {
    const events: RagStreamEvent[] = [];
    for await (const event of new MockRagClient().streamAnswer({ question: '[mock:malformed]' })) events.push(event);
    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events.some((event) => event.type === 'final')).toBe(false);
  });
  it('uses canonical handoff draft and confirmation identifiers', async () => {
    const client = new MockRagClient();
    const preview = await client.previewHandoff({ summary: 'help', documentationEvidence: [] });
    const result = await client.confirmHandoff(preview.draftId);
    expect(result.ticket.reference).toBe('HND-MOCK-000001');
  });
});
