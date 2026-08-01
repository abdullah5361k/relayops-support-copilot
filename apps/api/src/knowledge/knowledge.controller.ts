import { Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';
import { MiniLmEmbeddingProvider } from './embeddings';
import { KnowledgeRetrievalService } from './retrieval.service';

@Controller('knowledge')
export class KnowledgeController {
  private readonly embedder = new MiniLmEmbeddingProvider();
  constructor(private readonly retrieval: KnowledgeRetrievalService) {}
  /** Development evidence inspection only; it returns chunks, never generated answers. */
  @Get('search') async search(@Query('q') query = '') {
    try { return { evidence: await this.retrieval.searchPublic(query, this.embedder) }; }
    catch (error) { throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Knowledge embeddings unavailable'); }
  }
}
