import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DemoSessionController } from './auth/demo-session.controller';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AccountToolModule } from './account-tools/account-tool.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [PrismaModule, AuthModule, DashboardModule, KnowledgeModule, AccountToolModule, SupportModule],
  controllers: [AppController, DemoSessionController],
  providers: []
})
export class AppModule {}
