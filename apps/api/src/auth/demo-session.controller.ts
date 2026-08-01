import { BadRequestException, Body, Controller, Delete, Get, Post, Res } from '@nestjs/common';
import type { DemoIdentity, DemoSessionResponse } from '@relayops/contracts';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { demoProfiles, demoSessionCookie } from './demo-identities';

@Controller('demo')
export class DemoSessionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('identities')
  identities() {
    return demoProfiles.map(({ identity, label }) => ({ identity, label }));
  }

  @Post('session')
  async create(@Body() body: { identity?: string }, @Res({ passthrough: true }) response: Response): Promise<DemoSessionResponse> {
    const profile = demoProfiles.find((candidate) => candidate.identity === body.identity);
    if (!profile) throw new BadRequestException('Use one of the supplied demo identities');

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user: { email: profile.email },
        organization: { slug: profile.organizationSlug },
        status: 'ACTIVE'
      },
      include: { user: true, organization: true }
    });
    if (!membership) throw new BadRequestException('Demo data is not seeded');

    response.cookie(demoSessionCookie, profile.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });
    return {
      identity: profile.identity as DemoIdentity,
      userName: membership.user.name,
      organizationName: membership.organization.name
    };
  }

  @Delete('session')
  clear(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(demoSessionCookie, { path: '/' });
    return { ok: true };
  }
}
