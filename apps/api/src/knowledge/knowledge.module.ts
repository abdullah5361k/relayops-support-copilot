import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeIngestionService } from './ingestion.service';
import { KnowledgeRetrievalService } from './retrieval.service';

@Module({ controllers: [KnowledgeController], providers: [KnowledgeIngestionService, KnowledgeRetrievalService], exports: [KnowledgeIngestionService, KnowledgeRetrievalService] })
export class KnowledgeModule {}
