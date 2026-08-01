import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { demoProfiles, demoSessionCookie } from './demo-identities';
import type { TenantRequest } from './tenant-context';

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1];
}

@Injectable()
export class DemoSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const rawCookie = request.headers.cookie;
    const token = cookieValue(Array.isArray(rawCookie) ? rawCookie[0] : rawCookie, demoSessionCookie);
    const profile = demoProfiles.find((candidate) => candidate.sessionToken === token);
    if (!profile) throw new UnauthorizedException('Select a supplied demo identity to continue');

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user: { email: profile.email },
        organization: { slug: profile.organizationSlug },
        status: MembershipStatus.ACTIVE
      },
      include: { user: true }
    });
    if (!membership) throw new UnauthorizedException('Demo membership is not active');

    request.tenant = {
      organizationId: membership.organizationId,
      userId: membership.userId,
      userName: membership.user.name,
      userEmail: membership.user.email,
      role: membership.role
    };
    return true;
  }
}
