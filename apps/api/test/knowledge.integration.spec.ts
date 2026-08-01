import { resolve } from 'node:path';
import { DeterministicEmbeddingProvider } from '../src/knowledge/embeddings';
import { KnowledgeIngestionService } from '../src/knowledge/ingestion.service';
import { KnowledgeRetrievalService } from '../src/knowledge/retrieval.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PUBLIC_NAMESPACE, type EmbeddingProvider } from '../src/knowledge/types';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
integration('real PostgreSQL knowledge lifecycle and public retrieval', () => {
  const prisma = new PrismaService(); const logicalId = 'integration-knowledge-lifecycle'; const root = resolve(process.cwd(), '../..');
  beforeAll(async () => { await prisma.$connect(); await prisma.knowledgeSource.deleteMany({ where: { logicalId } }); });
  afterAll(async () => { await prisma.knowledgeSource.deleteMany({ where: { logicalId } }); await prisma.$disconnect(); });
  it('activates complete versions atomically, skips unchanged content, and keeps old active data on failure', async () => {
    const ingestion = new KnowledgeIngestionService(prisma); const good = new DeterministicEmbeddingProvider();
    const baseline = { logicalId, title: 'Lifecycle test', format: 'html' as const, path: 'sources/dispatch-basics.html', visibility: 'PUBLIC' as const, namespace: PUBLIC_NAMESPACE };
    expect((await ingestion.ingestSource(baseline, good, root)).status).toBe('ingested'); expect((await ingestion.ingestSource(baseline, good, root)).status).toBe('skipped');
    const before = await prisma.knowledgeSource.findUniqueOrThrow({ where: { logicalId } }); const unavailable: EmbeddingProvider = { modelId: 'broken', modelVersion: 'v1', embed: async () => { throw new Error('intentional embedding failure'); } };
    const failed = await ingestion.ingestSource({ ...baseline, path: 'sources/incident-response-v1.html' }, unavailable, root); expect(failed).toMatchObject({ status: 'failed' });
    const after = await prisma.knowledgeSource.findUniqueOrThrow({ where: { logicalId }, include: { activeVersion: true, versions: true } });
    expect(after.activeVersionId).toBe(before.activeVersionId); expect(after.activeVersion?.status).toBe('COMPLETE'); expect(after.versions.some((version) => version.status === 'FAILED')).toBe(true);
    expect((await ingestion.ingestSource({ ...baseline, path: 'sources/incident-response-v2.html' }, good, root)).status).toBe('ingested');
    const fresh = await prisma.knowledgeSource.findUniqueOrThrow({ where: { logicalId }, include: { versions: true } }); expect(fresh.versions.some((version) => version.status === 'SUPERSEDED')).toBe(true);
    const evidence = await new KnowledgeRetrievalService(prisma).searchPublic('urgent incident acknowledgement', good); expect(evidence.some((item) => item.sourceLogicalId === logicalId)).toBe(true); expect(evidence.every((item) => item.sourceLogicalId !== 'private-tenant-source')).toBe(true);
  });
});
