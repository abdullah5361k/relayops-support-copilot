import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { KnowledgeRunStatus, KnowledgeVersionStatus, KnowledgeVisibility } from '@prisma/client';
import { chunkSections } from './chunker';
import { extract } from './extractors';
import type { CorpusSource, EmbeddingProvider } from './types';
import { PUBLIC_NAMESPACE } from './types';
import { PrismaService } from '../prisma/prisma.service';

export const PARSER_VERSION = 'relayops-extract-chunk-v1';
@Injectable()
export class KnowledgeIngestionService {
  constructor(private readonly prisma: PrismaService) {}
  async ingestCommittedCorpus(embedder: EmbeddingProvider): Promise<Array<{ logicalId: string; status: 'ingested' | 'skipped' | 'failed'; message?: string }>> {
    const root = resolve(__dirname, '../../../..');
    const manifest = JSON.parse(await readFile(resolve(root, 'corpus/manifest.json'), 'utf8')) as CorpusSource[];
    return Promise.all(manifest.map((source) => this.ingestSource(source, embedder, root)));
  }
  async ingestSource(source: CorpusSource, embedder: EmbeddingProvider, root = resolve(__dirname, '../../../..')): Promise<{ logicalId: string; status: 'ingested' | 'skipped' | 'failed'; message?: string }> {
    if (source.visibility !== 'PUBLIC' || source.namespace !== PUBLIC_NAMESPACE || source.path.includes('..') || !source.path.startsWith('sources/')) throw new Error('Only allowlisted public corpus manifest entries may be ingested');
    const bytes = await readFile(resolve(root, 'corpus', source.path)); const checksum = createHash('sha256').update(bytes).digest('hex');
    const knowledgeSource = await this.prisma.knowledgeSource.upsert({ where: { logicalId: source.logicalId }, create: { logicalId: source.logicalId, title: source.title, visibility: KnowledgeVisibility.PUBLIC, namespace: PUBLIC_NAMESPACE }, update: { title: source.title } });
    const existing = await this.prisma.knowledgeSourceVersion.findUnique({ where: { sourceId_checksum_parserVersion: { sourceId: knowledgeSource.id, checksum, parserVersion: PARSER_VERSION } } });
    if (existing?.status === KnowledgeVersionStatus.COMPLETE) { await this.prisma.knowledgeIngestionRun.create({ data: { sourceId: knowledgeSource.id, versionId: existing.id, status: KnowledgeRunStatus.SKIPPED, finishedAt: new Date() } }); return { logicalId: source.logicalId, status: 'skipped' }; }
    const version = existing ? await this.prisma.knowledgeSourceVersion.update({ where: { id: existing.id }, data: { status: KnowledgeVersionStatus.PROCESSING, error: null, modelId: embedder.modelId, modelVersion: embedder.modelVersion } }) : await this.prisma.knowledgeSourceVersion.create({ data: { sourceId: knowledgeSource.id, checksum, parserVersion: PARSER_VERSION, sourceFormat: source.format, status: KnowledgeVersionStatus.PROCESSING, modelId: embedder.modelId, modelVersion: embedder.modelVersion } });
    const run = await this.prisma.knowledgeIngestionRun.create({ data: { sourceId: knowledgeSource.id, versionId: version.id } });
    try {
      const chunks = chunkSections(await extract(bytes, source.format)); if (!chunks.length) throw new Error('Extraction produced no indexable chunks');
      const vectors = await embedder.embed(chunks.map((chunk) => chunk.content)); if (vectors.length !== chunks.length) throw new Error(`Embedding provider returned ${vectors.length} vectors for ${chunks.length} chunks`);
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { versionId: version.id } });
        for (let i = 0; i < chunks.length; i++) { const chunk = chunks[i]!; const vector = `[${vectors[i]!.join(',')}]`;
          await tx.$executeRaw`INSERT INTO knowledge_chunks (id, version_id, ordinal, content, heading, section, page, anchor, char_start, char_end, token_count, search_text, embedding) VALUES (gen_random_uuid(), ${version.id}::uuid, ${chunk.ordinal}, ${chunk.content}, ${chunk.heading ?? null}, ${chunk.section ?? null}, ${chunk.page ?? null}, ${chunk.anchor ?? null}, ${chunk.charStart}, ${chunk.charEnd}, ${chunk.tokenCount}, ${chunk.searchText}, ${vector}::vector)`;
        }
        await tx.knowledgeSourceVersion.update({ where: { id: version.id }, data: { status: KnowledgeVersionStatus.COMPLETE, completedAt: new Date(), error: null } });
        const previous = await tx.knowledgeSource.findUnique({ where: { id: knowledgeSource.id }, select: { activeVersionId: true } });
        await tx.knowledgeSource.update({ where: { id: knowledgeSource.id }, data: { activeVersionId: version.id } });
        if (previous?.activeVersionId && previous.activeVersionId !== version.id) await tx.knowledgeSourceVersion.update({ where: { id: previous.activeVersionId }, data: { status: KnowledgeVersionStatus.SUPERSEDED } });
        await tx.knowledgeIngestionRun.update({ where: { id: run.id }, data: { status: KnowledgeRunStatus.SUCCEEDED, finishedAt: new Date() } });
      }); return { logicalId: source.logicalId, status: 'ingested' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.$transaction([this.prisma.knowledgeSourceVersion.update({ where: { id: version.id }, data: { status: KnowledgeVersionStatus.FAILED, error: message } }), this.prisma.knowledgeIngestionRun.update({ where: { id: run.id }, data: { status: KnowledgeRunStatus.FAILED, error: message, finishedAt: new Date() } })]);
      return { logicalId: source.logicalId, status: 'failed', message };
    }
  }
}
