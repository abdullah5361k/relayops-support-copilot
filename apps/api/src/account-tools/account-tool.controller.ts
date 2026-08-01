import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import { TenantContext, type TenantContextValue } from '../auth/tenant-context';
import { AccountToolService } from './account-tool.service';

/**
 * Direct deterministic API surface for a future integration seam. No UI or model
 * runtime calls this controller; tenant authority comes only from DemoSessionGuard.
 */
@Controller('account-tools')
@UseGuards(DemoSessionGuard)
export class AccountToolController {
  constructor(private readonly accountTools: AccountToolService) {}

  @Get('subscription-seat-usage')
  subscriptionSeatUsage(@TenantContext() tenant: TenantContextValue) {
    return this.accountTools.subscriptionSeatUsage(tenant);
  }

  @Get('jobs/:reference/status')
  jobStatus(@TenantContext() tenant: TenantContextValue, @Param('reference') reference: string) {
    return this.accountTools.jobStatus(tenant, reference);
  }

  @Get('tickets/:reference/status')
  ticketStatus(@TenantContext() tenant: TenantContextValue, @Param('reference') reference: string) {
    return this.accountTools.supportTicketStatus(tenant, reference);
  }

  @Post('handoffs/preview')
  @HttpCode(200)
  preview(@TenantContext() tenant: TenantContextValue, @Body() input: unknown) {
    return this.accountTools.previewHandoff(tenant, input);
  }

  @Post('handoffs/confirm')
  @HttpCode(200)
  confirm(@TenantContext() tenant: TenantContextValue, @Body() input: unknown) {
    return this.accountTools.confirmHandoff(tenant, input);
  }

  @Post('handoffs/cancel')
  @HttpCode(200)
  cancel(@TenantContext() tenant: TenantContextValue, @Body() input: unknown) {
    return this.accountTools.cancelHandoff(tenant, input);
  }
}
