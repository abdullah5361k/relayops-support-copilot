import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DemoSessionResolver } from './demo-session.resolver';
import type { TenantRequest } from './tenant-context';

@Injectable()
export class DemoSessionGuard implements CanActivate {
  constructor(private readonly sessions: DemoSessionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenant = await this.sessions.resolve(request.headers);
    if (!tenant) throw new UnauthorizedException('Select a supplied demo identity to continue');
    request.tenant = tenant;
    return true;
  }
}
