import { Module } from '@nestjs/common';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DemoSessionGuard]
})
export class DashboardModule {}
