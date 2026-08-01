export const QWEN_MODEL = 'qwen3:4b' as const;
export type ProviderFailureCode = 'UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED' | 'MALFORMED';

export class GenerationProviderError extends Error {
  constructor(readonly code: ProviderFailureCode, message: string) { super(message); }
}

export interface ProviderStatus {
  provider: 'ollama';
  model: typeof QWEN_MODEL;
  available: boolean;
}

export interface GenerationProvider {
  readonly provider: 'ollama';
  readonly model: typeof QWEN_MODEL;
  status(signal?: AbortSignal): Promise<ProviderStatus>;
  generate(prompt: string, signal?: AbortSignal): Promise<string>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

class LocalQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly maxActive = 2, private readonly maxWaiting = 4) {}
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new GenerationProviderError('CANCELLED', 'Generation was cancelled');
    if (this.active >= this.maxActive) {
      if (this.waiting.length >= this.maxWaiting) throw new GenerationProviderError('UNAVAILABLE', 'Local Qwen is busy; wait for an active response to finish');
      await new Promise<void>((resolve, reject) => {
        const release = () => { signal?.removeEventListener('abort', abort); resolve(); };
        const abort = () => { const index = this.waiting.indexOf(release); if (index >= 0) this.waiting.splice(index, 1); reject(new GenerationProviderError('CANCELLED', 'Generation was cancelled')); };
        signal?.addEventListener('abort', abort, { once: true });
        this.waiting.push(release);
      });
    }
    this.active++;
    try { return await work(); }
    finally { this.active--; this.waiting.shift()?.(); }
  }
}

function assertLocalBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('RELAYOPS_OLLAMA_BASE_URL must be a valid local http URL'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('RELAYOPS_OLLAMA_BASE_URL must point to local Ollama (localhost, 127.0.0.1, or ::1)');
  }
  return url.toString().replace(/\/$/, '');
}

/** Narrow local-only adapter. It never selects a model, invokes tools, or accepts remote endpoints. */
export class OllamaQwenProvider implements GenerationProvider {
  readonly provider = 'ollama' as const;
  readonly model = QWEN_MODEL;
  private readonly baseUrl: string;
  private readonly queue: LocalQueue;
  private readonly connectTimeoutMs: number;
  private readonly readTimeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: { baseUrl?: string; connectTimeoutMs?: number; readTimeoutMs?: number; concurrency?: number; fetcher?: FetchLike } = {}) {
    const configuredModel = process.env.RELAYOPS_OLLAMA_MODEL;
    if (configuredModel && configuredModel !== QWEN_MODEL) throw new Error(`RELAYOPS_OLLAMA_MODEL must be exactly ${QWEN_MODEL}; RelayOps never silently switches models`);
    this.baseUrl = assertLocalBaseUrl(options.baseUrl ?? process.env.RELAYOPS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434');
    this.connectTimeoutMs = options.connectTimeoutMs ?? Number(process.env.RELAYOPS_OLLAMA_CONNECT_TIMEOUT_MS ?? 1_500);
    this.readTimeoutMs = options.readTimeoutMs ?? Number(process.env.RELAYOPS_OLLAMA_READ_TIMEOUT_MS ?? 45_000);
    this.queue = new LocalQueue(options.concurrency ?? Number(process.env.RELAYOPS_OLLAMA_CONCURRENCY ?? 2));
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try { return await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: combined }); }
    catch {
      if (signal?.aborted) throw new GenerationProviderError('CANCELLED', 'Generation was cancelled');
      if (timeout.aborted) throw new GenerationProviderError('TIMEOUT', `Local Ollama did not respond within ${timeoutMs}ms`);
      throw new GenerationProviderError('UNAVAILABLE', `Local Ollama at ${this.baseUrl} is unavailable. Start the optional ollama profile and pull ${QWEN_MODEL}.`);
    }
  }

  async status(signal?: AbortSignal): Promise<ProviderStatus> {
    const response = await this.request('/api/tags', { method: 'GET' }, this.connectTimeoutMs, signal);
    if (!response.ok) throw new GenerationProviderError('UNAVAILABLE', `Local Ollama returned HTTP ${response.status} while checking models`);
    let body: { models?: Array<{ name?: string }> };
    try { body = await response.json() as { models?: Array<{ name?: string }> }; }
    catch { throw new GenerationProviderError('MALFORMED', 'Local Ollama returned an invalid model list'); }
    const available = body.models?.some((item) => item.name === QWEN_MODEL) ?? false;
    if (!available) throw new GenerationProviderError('UNAVAILABLE', `Local Ollama is running but ${QWEN_MODEL} is not installed. Run the documented explicit model pull.`);
    return { provider: this.provider, model: this.model, available };
  }

  async generate(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.queue.run(async () => {
      const response = await this.request('/api/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: QWEN_MODEL, prompt, stream: false, format: 'json', think: false, options: { temperature: 0, num_predict: 350 } })
      }, this.readTimeoutMs, signal);
      if (!response.ok) throw new GenerationProviderError('UNAVAILABLE', `Local Ollama returned HTTP ${response.status} while generating`);
      let body: { response?: unknown };
      try { body = await response.json() as { response?: unknown }; }
      catch { throw new GenerationProviderError('MALFORMED', 'Local Ollama returned malformed generation JSON'); }
      if (typeof body.response !== 'string' || !body.response.trim()) throw new GenerationProviderError('MALFORMED', 'Local Ollama returned no structured response');
      return body.response;
    }, signal);
  }
}
