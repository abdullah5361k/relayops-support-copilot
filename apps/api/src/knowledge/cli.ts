import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MiniLmEmbeddingProvider } from './embeddings';
import { KnowledgeIngestionService } from './ingestion.service';
import { KnowledgeRetrievalService } from './retrieval.service';
import { PrismaService } from '../prisma/prisma.service';

type Gold = { id: string; query: string; expectedSources: string[]; forbiddenText?: string; unanswerable?: boolean };
async function main() {
  const command = process.argv[2]; const prisma = new PrismaService(); await prisma.$connect();
  try {
    if (command === 'inspect') { console.log(JSON.stringify(await prisma.knowledgeSource.findMany({ include: { activeVersion: true, versions: { include: { runs: true, _count: { select: { chunks: true } } }, orderBy: { createdAt: 'asc' } } }, orderBy: { logicalId: 'asc' } }), null, 2)); return; }
    if (command === 'ingest') { console.log(JSON.stringify(await new KnowledgeIngestionService(prisma).ingestCommittedCorpus(new MiniLmEmbeddingProvider()), null, 2)); return; }
    const query = process.argv.slice(3).join(' '); const retrieval = new KnowledgeRetrievalService(prisma); const embedder = new MiniLmEmbeddingProvider();
    if (command === 'search') { if (!query) throw new Error('Usage: knowledge:search -- "query"'); console.log(JSON.stringify(await retrieval.searchPublic(query, embedder), null, 2)); return; }
    if (command === 'smoke') { const [vector] = await embedder.embed(['RelayOps MiniLM smoke test']); console.log(JSON.stringify({ modelId: embedder.modelId, modelVersion: embedder.modelVersion, dimensions: vector?.length, finite: vector?.every(Number.isFinite), norm: vector ? Math.hypot(...vector) : null }, null, 2)); return; }
    if (command === 'evaluate') {
      const gold = JSON.parse(await readFile(resolve(__dirname, '../../../..', 'corpus/gold-set.v1.json'), 'utf8')) as Gold[]; let sourceHits = 0; let expected = 0; let stale = 0; let namespace = 0; const latencies: number[] = []; const detail = [];
      for (const item of gold) { const start = performance.now(); const evidence = await retrieval.searchPublic(item.query, embedder); latencies.push(performance.now() - start); const found = new Set(evidence.map((entry) => entry.sourceLogicalId)); const hit = item.expectedSources.every((source) => found.has(source)); if (item.expectedSources.length) { expected++; if (hit) sourceHits++; } if (item.forbiddenText && evidence.some((entry) => entry.content.toLowerCase().includes(item.forbiddenText!.toLowerCase()))) stale++; if (evidence.some((entry) => entry.sourceLogicalId.startsWith('private-'))) namespace++; detail.push({ id: item.id, hit, evidence: [...found], latencyMs: Math.round(latencies.at(-1)!) }); }
      console.log(JSON.stringify({ goldSet: 'v1', recallAt5: expected ? sourceHits / expected : 0, expectedSourceHitRate: expected ? sourceHits / expected : 0, staleVersionViolations: stale, namespaceViolations: namespace, latencyMs: { mean: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length), max: Math.round(Math.max(...latencies)) }, detail }, null, 2)); return;
    }
    throw new Error('Usage: knowledge:(ingest|inspect|search|smoke|evaluate)');
  } finally { await prisma.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
