import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantContextValue {
  organizationId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

export interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  tenant?: TenantContextValue;
}

export const TenantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContextValue => {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.tenant) throw new Error('Tenant context was not established');
    return request.tenant;
  }
);
