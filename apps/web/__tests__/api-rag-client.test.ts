import { describe, expect, it } from 'vitest';
import { ApiRagClient } from '@/lib/api-rag-client';
import type { RagStreamEvent } from '@/lib/rag-contracts';

const response = { traceId: 'trace-1', state: 'ANSWERED' as const, answer: 'Active evidence says one hour.', citations: [{ evidenceId: 'chunk-1', sourceLogicalId: 'incident-response-policy', sourceTitle: 'Incident response policy', sourceType: 'html' as const, heading: 'Acknowledgement', section: null, page: null, anchor: 'acknowledgement', excerpt: 'The coordinator acknowledges the report within one business hour.' }], accountEvidence: [], accountToolPlan: null, handoffPreviewEvidence: [], handoffAvailable: false, refusalReason: null, suggestedTopics: [], provider: { provider: 'ollama' as const, model: 'qwen3:4b' as const, available: true } };
function sse(parts: string[]): Response { const encoder = new TextEncoder(); return new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(encoder.encode(part)); controller.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } }); }
async function collect(client: ApiRagClient): Promise<RagStreamEvent[]> { const events: RagStreamEvent[] = []; for await (const event of client.streamAnswer({ question: 'How quickly?' })) events.push(event); return events; }
describe('ApiRagClient SSE boundary', () => {
  it('handles arbitrary chunk boundaries and releases only a completed validated final', async () => {
    const body = [`event: lifecycle\ndata: ${JSON.stringify({ type: 'lifecycle', traceId: 'trace-1', stage: 'retrieving' })}\n\n`, `event: status\ndata: ${JSON.stringify({ type: 'status', traceId: 'trace-1', provider: response.provider })}\n\n`, `event: final\ndata: ${JSON.stringify({ type: 'final', response })}\n\n`, `event: lifecycle\ndata: ${JSON.stringify({ type: 'lifecycle', traceId: 'trace-1', stage: 'complete' })}\n\n`].join('');
    const client = new ApiRagClient((async () => sse([body.slice(0, 17), body.slice(17, 93), body.slice(93)])) as typeof fetch);
    const events = await collect(client); expect(events.filter((event) => event.type === 'final')).toHaveLength(1); expect(events.some((event) => event.type === 'phase' && event.phase === 'retrieving')).toBe(true);
  });
  it('clears an unsupported terminal path as malformed instead of accepting text', async () => {
    const bad = `event: final\ndata: ${JSON.stringify({ type: 'final', response })}\n\n`;
    const client = new ApiRagClient((async () => sse([bad])) as typeof fetch); const events = await collect(client);
    expect(events.some((event) => event.type === 'final')).toBe(false); expect(events.some((event) => event.type === 'error' && event.code === 'malformed-response')).toBe(true);
  });
});
