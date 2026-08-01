import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from './types';

export function validateVector(vector: readonly number[]): number[] {
  if (vector.length !== EMBEDDING_DIMENSIONS) throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimensional embedding, received ${vector.length}`);
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('Embedding contains non-finite values');
  const magnitude = Math.hypot(...vector); if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error('Embedding has zero magnitude');
  return vector.map((value) => value / magnitude);
}
export const DETERMINISTIC_EMBEDDING_TEST_FLAG = 'RELAYOPS_TEST_DETERMINISTIC_EMBEDDINGS';

/** CI/browser tests opt in explicitly; normal and deployed processes always use local MiniLM. */
export function usesDeterministicTestEmbeddings(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[DETERMINISTIC_EMBEDDING_TEST_FLAG] === '1';
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'relayops/deterministic-test-embedding'; readonly modelVersion = 'v1';
  async embed(texts: readonly string[]): Promise<number[][]> { return texts.map((text) => {
    const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0); const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? ['empty'];
    for (const word of words) { const digest = createHash('sha256').update(word).digest(); for (let i = 0; i < digest.length; i++) { const byte = digest[i]!; const index = (byte + i * 37) % EMBEDDING_DIMENSIONS; values[index] = values[index]! + (byte % 2 ? 1 : -1); } }
    return validateVector(values);
  }); }
}
/** Production/local MiniLM adapter. First use downloads public model files to RELAYOPS_MODEL_CACHE (or the Transformers cache); offline/corrupt state throws and never activates a version. It never falls back to deterministic vectors. */
export class MiniLmEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'Xenova/all-MiniLM-L6-v2'; readonly modelVersion = 'onnx-fp32'; private extractor?: any;
  constructor(private readonly cacheDir = process.env.RELAYOPS_MODEL_CACHE) {}
  private async load(): Promise<any> {
    if (!process.versions.node.startsWith('22.')) throw new Error(`MiniLM embeddings require the project-pinned Node 22 runtime; found Node ${process.versions.node}`);
    if (this.extractor) return this.extractor;
    try {
      // Dynamic import keeps regular API/unit paths from loading model runtime or weights.
      const transformers: any = await (new Function('return import("@huggingface/transformers")')() as Promise<any>);
      if (this.cacheDir) transformers.env.cacheDir = this.cacheDir;
      this.extractor = await transformers.pipeline('feature-extraction', this.modelId, { dtype: 'fp32' }); return this.extractor;
    } catch (error) { throw new Error(`MiniLM embeddings unavailable. Download/cache ${this.modelId} with network access or set RELAYOPS_MODEL_CACHE to a valid cache. ${error instanceof Error ? error.message : String(error)}`); }
  }
  async embed(texts: readonly string[]): Promise<number[][]> {
    const extractor = await this.load(); const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += 16) { const output = await extractor(texts.slice(start, start + 16), { pooling: 'mean', normalize: true }); const data = Array.from(output.data as Float32Array); for (let offset = 0; offset < data.length; offset += EMBEDDING_DIMENSIONS) vectors.push(validateVector(data.slice(offset, offset + EMBEDDING_DIMENSIONS) as number[])); }
    return vectors;
  }
}

/** The deterministic provider is intentionally reachable only through the exact test-only flag. */
export function createEmbeddingProvider(environment: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  return usesDeterministicTestEmbeddings(environment) ? new DeterministicEmbeddingProvider() : new MiniLmEmbeddingProvider(environment.RELAYOPS_MODEL_CACHE);
}
