import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import { TenantContext, type TenantContextValue } from '../auth/tenant-context';
import { DashboardService } from './dashboard.service';

@Controller()
@UseGuards(DemoSessionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  dashboard(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.dashboard(tenant);
  }

  @Get('jobs')
  jobs(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.jobs(tenant);
  }

  @Get('jobs/:id')
  job(@TenantContext() tenant: TenantContextValue, @Param('id') id: string) {
    return this.dashboardService.job(tenant, id);
  }

  @Get('team')
  team(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.team(tenant);
  }

  @Get('customers')
  customers(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.customers(tenant);
  }

  @Get('customers/:id')
  customer(@TenantContext() tenant: TenantContextValue, @Param('id') id: string) {
    return this.dashboardService.customer(tenant, id);
  }

  @Get('subscription')
  subscription(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.subscription(tenant);
  }

  @Get('support/tickets')
  tickets(@TenantContext() tenant: TenantContextValue) {
    return this.dashboardService.tickets(tenant);
  }
}
