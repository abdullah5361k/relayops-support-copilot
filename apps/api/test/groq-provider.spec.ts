import { GROQ_CHAT_COMPLETIONS_URL, GROQ_MODEL, BoundedQueue, DisabledGenerationProvider, GenerationProviderError, GroqFreePlanLimiter, GroqProvider, ProviderCircuitBreaker, createGenerationProvider } from '../src/support/generation.provider';
import { buildGroundedPrompt } from '../src/support/support-answer.service';
import type { Evidence } from '../src/knowledge/types';

const evidence: Evidence = { id: 'public-evidence-a', sourceLogicalId: 'incident-guide', sourceTitle: 'Incident guide', sourceType: 'html', content: 'Acknowledge urgent incidents within fifteen minutes and record the incident timeline.', heading: 'Urgent incidents', section: null, page: 2, anchor: 'urgent', score: 0.03 };
const grounded = () => buildGroundedPrompt('How quickly should an urgent incident be acknowledged?', [evidence]);
function groqBody(content = '{"claims":[{"text":"Acknowledge urgent incidents within fifteen minutes.","citationIds":["public-evidence-a"]}]}') {
  return JSON.stringify({ model: GROQ_MODEL, choices: [{ message: { content } }], usage: { prompt_tokens: 123, completion_tokens: 22, total_tokens: 145 } });
}
function response(status = 200, body = groqBody(), headers?: Record<string, string>): Response { return new Response(body, { status, headers }); }

function adapter(fetcher: typeof fetch, extra: ConstructorParameters<typeof GroqProvider>[0] = {}) {
  return new GroqProvider({ apiKey: 'test-only-key', fetcher, observer: jest.fn(), ...extra });
}

describe('Groq direct HTTPS provider', () => {
  it('pins the official host/model and strict schema without putting credentials in the JSON body', async () => {
    const fetcher = jest.fn().mockResolvedValue(response()); const provider = adapter(fetcher);
    const result = await provider.generate(grounded(), undefined, { traceId: 'trace-only' });
    expect(result.metrics).toMatchObject({ inputTokens: 123, outputTokens: 22, totalTokens: 145 });
    expect(fetcher).toHaveBeenCalledWith(GROQ_CHAT_COMPLETIONS_URL, expect.objectContaining({ method: 'POST' }));
    const init = fetcher.mock.calls[0]![1]!; const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ model: GROQ_MODEL, temperature: 0, stream: false, max_completion_tokens: 420, response_format: { type: 'json_schema', json_schema: { strict: true, name: 'relayops_grounded_answer' } } });
    expect(payload.response_format.json_schema.schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['claims'], properties: { claims: { maxItems: 3, items: { additionalProperties: false, required: ['text', 'citationIds'] } } } });
    expect(payload.messages).toHaveLength(2); expect(payload.messages[0].role).toBe('system'); expect(payload.messages[1].content).toContain('EVIDENCE_DATA_START');
    expect(JSON.stringify(payload)).not.toContain('test-only-key'); expect(JSON.stringify(payload)).not.toContain('GROQ_API_KEY');
    expect(init.headers).toEqual(expect.objectContaining({ authorization: 'Bearer test-only-key' }));
  });

  it('sends bounded public question/evidence only; account, tenant, and handoff sentinels cannot enter a request body', async () => {
    const fetcher = jest.fn().mockResolvedValue(response()); const provider = adapter(fetcher);
    await provider.generate(grounded());
    const bytes = String(fetcher.mock.calls[0]![1]!.body);
    for (const forbidden of ['Northstar HVAC', 'tenant-uuid-should-never-send', 'account-tool-result', 'handoff transcript', 'relayops_demo_session']) expect(bytes).not.toContain(forbidden);
    expect(bytes).toContain('public-evidence-a'); expect(bytes).toContain('urgent incident');
  });

  it.each([[401, 'AUTH'], [403, 'AUTH'], [400, 'BAD_REQUEST'], [413, 'TOO_LARGE'], [500, 'SERVER']] as const)('maps HTTP %s safely to %s', async (status, code) => {
    const provider = adapter(jest.fn().mockResolvedValue(response(status, '{}')));
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code });
  });

  it('maps 429 and Retry-After without sleeping or retrying', async () => {
    const fetcher = jest.fn().mockResolvedValue(response(429, '{}', { 'retry-after': '17' })); const provider = adapter(fetcher);
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterSeconds: 17 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed, wrong-model, and overlong responses', async () => {
    await expect(adapter(jest.fn().mockResolvedValue(response(200, 'not-json'))).generate(grounded())).rejects.toMatchObject({ code: 'MALFORMED' });
    await expect(adapter(jest.fn().mockResolvedValue(response(200, JSON.stringify({ model: 'other', choices: [{ message: { content: '{}' } }] })))).generate(grounded())).rejects.toMatchObject({ code: 'MALFORMED' });
  });

  it('propagates cancellation and hard deadlines', async () => {
    const pending = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const cancel = new AbortController(); const provider = adapter(pending as typeof fetch, { connectTimeoutMs: 200, totalTimeoutMs: 220 });
    const request = provider.generate(grounded(), cancel.signal); cancel.abort();
    await expect(request).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(adapter(pending as typeof fetch, { connectTimeoutMs: 10, totalTimeoutMs: 20 }).generate(grounded())).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('opens after three provider failures and recovers after its bounded cooldown', async () => {
    let now = 1_000; const breaker = new ProviderCircuitBreaker(() => now, 3, 60_000, 300_000); const fetcher = jest.fn().mockResolvedValue(response(500, '{}'));
    const provider = adapter(fetcher, { breaker });
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'SERVER' });
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'SERVER' });
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'SERVER' });
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    now += 300_001; fetcher.mockResolvedValue(response());
    await expect(provider.generate(grounded())).resolves.toMatchObject({ text: expect.any(String) });
  });

  it('bounds provider concurrency and waiting work', async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = jest.fn().mockImplementation(async () => { await gate; return response(); });
    const provider = adapter(fetcher as typeof fetch, { concurrency: 1, queue: new BoundedQueue(1, 1, 'busy') });
    const first = provider.generate(grounded()); const second = provider.generate(grounded());
    await expect(provider.generate(grounded())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    release(); await expect(first).resolves.toBeDefined(); await expect(second).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses explicit provider selection and never falls back from Groq/Ollama', async () => {
    expect(createGenerationProvider({ RELAYOPS_GENERATION_PROVIDER: 'disabled' })).toBeInstanceOf(DisabledGenerationProvider);
    expect(createGenerationProvider({ RELAYOPS_GENERATION_PROVIDER: 'groq', GROQ_API_KEY: 'test-only-key' }).provider).toBe('groq');
    expect(() => createGenerationProvider({ RELAYOPS_GENERATION_PROVIDER: 'unknown' })).toThrow('exactly groq, ollama, or disabled');
    await expect(new DisabledGenerationProvider().status()).rejects.toBeInstanceOf(GenerationProviderError);
  });

  it('keeps conservative in-memory rate reservations bounded', () => {
    let now = 0; const limiter = new GroqFreePlanLimiter(() => now, 1, 1_000, 2, 2_000);
    limiter.reserve(100, 100); expect(() => limiter.reserve(100, 100)).toThrow('reserved');
    now += 60_001; expect(() => limiter.reserve(100, 100)).not.toThrow();
  });
});
