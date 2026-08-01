import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DemoSessionController } from './auth/demo-session.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, DashboardModule],
  controllers: [AppController, DemoSessionController]
})
export class AppModule {}
