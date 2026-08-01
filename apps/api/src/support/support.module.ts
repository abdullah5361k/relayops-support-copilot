import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OllamaQwenProvider } from './generation.provider';
import { SUPPORT_EMBEDDER, SUPPORT_GENERATION_PROVIDER, SupportAnswerService } from './support-answer.service';
import { MiniLmEmbeddingProvider } from '../knowledge/embeddings';
import { SupportController } from './support.controller';

@Module({
  imports: [KnowledgeModule, PrismaModule],
  controllers: [SupportController],
  providers: [
    { provide: SUPPORT_EMBEDDER, useFactory: () => new MiniLmEmbeddingProvider() },
    { provide: SUPPORT_GENERATION_PROVIDER, useFactory: () => new OllamaQwenProvider() },
    SupportAnswerService
  ]
})
export class SupportModule {}
