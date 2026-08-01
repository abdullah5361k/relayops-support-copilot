import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AccountToolModule } from '../account-tools/account-tool.module';
import { PrismaModule } from '../prisma/prisma.module';
import { createGenerationProvider } from './generation.provider';
import { SUPPORT_EMBEDDER, SUPPORT_GENERATION_PROVIDER, SupportAnswerService } from './support-answer.service';
import { createEmbeddingProvider } from '../knowledge/embeddings';
import { SupportController } from './support.controller';

@Module({
  imports: [KnowledgeModule, PrismaModule, AccountToolModule],
  controllers: [SupportController],
  providers: [
    { provide: SUPPORT_EMBEDDER, useFactory: () => createEmbeddingProvider() },
    { provide: SUPPORT_GENERATION_PROVIDER, useFactory: () => createGenerationProvider() },
    SupportAnswerService
  ]
})
export class SupportModule {}
