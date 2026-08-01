import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { existsSync } from 'node:fs';
import type { KnowledgeReindexRequest, KnowledgeReindexResponse, KnowledgeRunSummary, KnowledgeSearchHit, KnowledgeSnapshot, SupportCitation } from '@relayops/contracts';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import { TenantContext, type TenantContextValue } from '../auth/tenant-context';
import { createEmbeddingProvider } from './embeddings';
import { KnowledgeIngestionService } from './ingestion.service';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeRetrievalService } from './retrieval.service';

const logicalIdPattern = /^[a-z0-9][a-z0-9-]{0,119}$/;
function owner(tenant: TenantContextValue): void { if (tenant.role !== 'OWNER') throw new ForbiddenException('Knowledge administration requires the supplied demo owner session'); }
function citation(item: { id: string; sourceLogicalId: string; sourceTitle: string; sourceType: 'html' | 'faq-json' | 'pdf' | 'docx'; content: string; heading: string | null; section: string | null; page: number | null; anchor: string | null }): SupportCitation {
  return { evidenceId: item.id, sourceLogicalId: item.sourceLogicalId, sourceTitle: item.sourceTitle, sourceType: item.sourceType, heading: item.heading, section: item.section, page: item.page, anchor: item.anchor, excerpt: item.content.replace(/\s+/g, ' ').trim().slice(0, 280) };
}

/** Owner-only observability for committed public corpus state. No paths, URLs, secrets, or error stacks leave this controller. */
@Controller('knowledge')
@UseGuards(DemoSessionGuard)
export class KnowledgeController {
  private readonly embedder = createEmbeddingProvider();
  constructor(private readonly retrieval: KnowledgeRetrievalService, private readonly ingestion: KnowledgeIngestionService, private readonly prisma: PrismaService) {}

  private async runs(): Promise<KnowledgeRunSummary[]> {
    const runs = await this.prisma.knowledgeIngestionRun.findMany({ take: 30, orderBy: { startedAt: 'desc' }, include: { source: { select: { logicalId: true } }, version: { select: { status: true } } } });
    return runs.map((run) => ({ id: run.id, sourceLogicalId: run.source.logicalId, status: run.status === 'SUCCEEDED' ? 'completed' : run.status === 'RUNNING' ? 'running' : run.status === 'SKIPPED' ? 'skipped' : 'failed', stage: run.status === 'FAILED' || run.version?.status === 'FAILED' ? 'failed' : run.status === 'RUNNING' ? 'processing' : run.status === 'SUCCEEDED' || run.status === 'SKIPPED' ? 'complete' : 'queued', startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, error: run.status === 'FAILED' ? 'The committed corpus run failed; the prior active version remains available.' : null }));
  }

  @Get()
  async snapshot(@TenantContext() tenant: TenantContextValue): Promise<KnowledgeSnapshot> {
    owner(tenant);
    const sources = await this.prisma.knowledgeSource.findMany({ orderBy: { logicalId: 'asc' }, include: { activeVersion: { include: { _count: { select: { chunks: true } } } }, versions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    const cacheDir = process.env.RELAYOPS_MODEL_CACHE;
    return {
      sources: sources.map((source) => ({ logicalId: source.logicalId, title: source.title, sourceType: (source.activeVersion?.sourceFormat ?? source.versions[0]?.sourceFormat ?? 'html') as 'html' | 'faq-json' | 'pdf' | 'docx', status: source.activeVersion ? 'active' : source.versions[0]?.status === 'FAILED' ? 'failed' : 'previous', activeVersion: source.activeVersion?.id ?? null, updatedAt: source.updatedAt.toISOString(), chunkCount: source.activeVersion?._count.chunks ?? 0 })),
      runs: await this.runs(),
      model: { name: 'Xenova/all-MiniLM-L6-v2', status: cacheDir && existsSync(cacheDir) ? 'ready' : 'unavailable', cache: cacheDir && existsSync(cacheDir) ? 'present' : 'missing', note: cacheDir && existsSync(cacheDir) ? 'Configured local MiniLM cache is present.' : 'MiniLM cache is not configured or present; reindex/search will report local availability honestly.' }
    };
  }

  @Get('search')
  async search(@TenantContext() tenant: TenantContextValue, @Query('q') query = ''): Promise<{ evidence: KnowledgeSearchHit[] }> {
    owner(tenant); const clean = query.trim().slice(0, 500); if (!clean) return { evidence: [] };
    try { return { evidence: (await this.retrieval.searchPublic(clean, this.embedder)).map((item) => ({ citation: citation(item), score: item.score })) }; }
    catch { throw new ServiceUnavailableException('Knowledge embeddings are unavailable locally. Configure a committed MiniLM cache and retry.'); }
  }

  @Post('reindex') @HttpCode(200)
  async reindex(@TenantContext() tenant: TenantContextValue, @Body() input: KnowledgeReindexRequest | unknown): Promise<KnowledgeReindexResponse> {
    owner(tenant);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => key !== 'logicalId')) throw new BadRequestException('Only an allowlisted logicalId may be reindexed');
    const logicalId = (input as KnowledgeReindexRequest).logicalId;
    if (logicalId !== undefined && (typeof logicalId !== 'string' || !logicalIdPattern.test(logicalId))) throw new BadRequestException('Only an allowlisted logicalId may be reindexed');
    try {
      const results = await this.ingestion.ingestAllowlisted(logicalId, this.embedder);
      return { results: results.map(({ logicalId: id, status }) => ({ logicalId: id, status })), runs: await this.runs() };
    } catch { throw new ServiceUnavailableException('Reindex could not complete from the committed local corpus. The previous active version was retained.'); }
  }
}
