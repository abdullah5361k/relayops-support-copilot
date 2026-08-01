import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DemoSessionController } from './auth/demo-session.controller';
import { DemoSessionGuard } from './auth/demo-session.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { KnowledgeModule } from './knowledge/knowledge.module';

@Module({
  imports: [PrismaModule, DashboardModule, KnowledgeModule],
  controllers: [AppController, DemoSessionController],
  providers: [DemoSessionGuard]
})
export class AppModule {}
