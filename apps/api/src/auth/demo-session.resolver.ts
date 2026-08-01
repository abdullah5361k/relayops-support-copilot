import { Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import type { TenantContextValue } from './tenant-context';
import { demoProfiles, demoSessionCookie } from './demo-identities';
import { PrismaService } from '../prisma/prisma.service';

function cookieValue(header: string | string[] | undefined, name: string): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1];
}

/** Resolves only a fixed opaque demo cookie; callers never supply tenant authority. */
@Injectable()
export class DemoSessionResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(headers: { cookie?: string | string[] }): Promise<TenantContextValue | null> {
    const token = cookieValue(headers.cookie, demoSessionCookie);
    const profile = demoProfiles.find((candidate) => candidate.sessionToken === token);
    if (!profile) return null;
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { user: { email: profile.email }, organization: { slug: profile.organizationSlug }, status: MembershipStatus.ACTIVE },
      include: { user: true }
    });
    if (!membership) return null;
    return { organizationId: membership.organizationId, userId: membership.userId, userName: membership.user.name, userEmail: membership.user.email, role: membership.role };
  }
}
