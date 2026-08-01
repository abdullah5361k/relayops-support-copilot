import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_NAMESPACE, type EmbeddingProvider, type Evidence } from './types';

type Candidate = { id: string; logicalId: string; title: string; sourceType: 'html' | 'faq-json' | 'pdf' | 'docx'; content: string; heading: string | null; section: string | null; page: number | null; anchor: string | null; rank: number };
const CANDIDATES = 20; const RRF_K = 60;
@Injectable()
export class KnowledgeRetrievalService {
  constructor(private readonly prisma: PrismaService) {}
  /** Public-only surface. Namespace is fixed server-side, never taken from a caller or tenant header. */
  async searchPublic(query: string, embedder: EmbeddingProvider, limit = 5): Promise<Evidence[]> {
    const text = query.trim(); if (!text) return []; const vector = `[${(await embedder.embed([text]))[0]!.join(',')}]`;
    const filters = Prisma.sql` s.visibility = 'PUBLIC'::"KnowledgeVisibility" AND s.namespace = ${PUBLIC_NAMESPACE} AND s.active_version_id = v.id AND v.status = 'COMPLETE'::"KnowledgeVersionStatus"`;
    const semantic = await this.prisma.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT c.id, s.logical_id AS "logicalId", s.title, v.source_format AS "sourceType", c.content, c.heading, c.section, c.page, c.anchor,
        row_number() OVER (ORDER BY c.embedding <=> ${vector}::vector, c.id)::int AS rank
      FROM knowledge_chunks c JOIN knowledge_source_versions v ON v.id = c.version_id JOIN knowledge_sources s ON s.id = v.source_id
      WHERE ${filters} AND c.embedding IS NOT NULL ORDER BY c.embedding <=> ${vector}::vector, c.id LIMIT ${CANDIDATES}`);
    const keyword = await this.prisma.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT c.id, s.logical_id AS "logicalId", s.title, v.source_format AS "sourceType", c.content, c.heading, c.section, c.page, c.anchor,
        row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.search_text), plainto_tsquery('english', ${text})) DESC, c.id)::int AS rank
      FROM knowledge_chunks c JOIN knowledge_source_versions v ON v.id = c.version_id JOIN knowledge_sources s ON s.id = v.source_id
      WHERE ${filters} AND to_tsvector('english', c.search_text) @@ plainto_tsquery('english', ${text})
      ORDER BY ts_rank_cd(to_tsvector('english', c.search_text), plainto_tsquery('english', ${text})) DESC, c.id LIMIT ${CANDIDATES}`);
    const fused = new Map<string, Evidence>();
    for (const [items, field] of [[semantic, 'semanticRank'], [keyword, 'keywordRank']] as const) for (const item of items) {
      const current = fused.get(item.id) ?? { id: item.id, sourceLogicalId: item.logicalId, sourceTitle: item.title, sourceType: item.sourceType, content: item.content, heading: item.heading, section: item.section, page: item.page, anchor: item.anchor, score: 0 };
      current.score += 1 / (RRF_K + item.rank); Object.assign(current, { [field]: item.rank }); fused.set(item.id, current);
    }
    const ordered = [...fused.values()].sort((a, b) => b.score - a.score || a.sourceLogicalId.localeCompare(b.sourceLogicalId));
    // First pass keeps one evidence item per source; second pass fills remaining capacity.
    const selected: Evidence[] = []; const seenSources = new Set<string>();
    for (const item of ordered) if (!seenSources.has(item.sourceLogicalId) && selected.length < limit) { selected.push(item); seenSources.add(item.sourceLogicalId); }
    for (const item of ordered) if (!selected.includes(item) && selected.length < limit) selected.push(item);
    return selected;
  }
}
