import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DemoSessionGuard } from '../src/auth/demo-session.guard';
import { DemoSessionResolver } from '../src/auth/demo-session.resolver';
import type { TenantRequest } from '../src/auth/tenant-context';

function contextFor(request: TenantRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

describe('DemoSessionGuard', () => {
  it('derives the tenant from the server-side demo profile, ignoring an organization header', async () => {
    const request: TenantRequest = {
      headers: {
        cookie: 'relayops_demo_session=demo-session-northstar-v1',
        'x-organization-id': 'prime'
      }
    };
    const findFirst = jest.fn().mockResolvedValue({
      organizationId: 'north',
      userId: 'maya',
      role: 'OWNER',
      user: { name: 'Maya Chen', email: 'maya@northstar.demo' }
    });
    const guard = new DemoSessionGuard(new DemoSessionResolver({ organizationMembership: { findFirst } } as unknown as PrismaService));

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        user: { email: 'maya@northstar.demo' },
        organization: { slug: 'northstar-hvac' },
        status: 'ACTIVE'
      }
    }));
    expect(request.tenant?.organizationId).toBe('north');
  });

  it('rejects unknown or caller-invented session tokens', async () => {
    const guard = new DemoSessionGuard(new DemoSessionResolver({} as PrismaService));
    const request: TenantRequest = { headers: { cookie: 'relayops_demo_session=organization-prime' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
