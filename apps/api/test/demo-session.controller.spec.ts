import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DemoSessionController } from '../src/auth/demo-session.controller';

function responseFake() { return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response; }

describe('DemoSessionController', () => {
  it('accepts only a supplied identity and issues an HttpOnly replacement cookie', async () => {
    const prisma = { organizationMembership: { findFirst: jest.fn().mockResolvedValue({
      role: 'OWNER', user: { name: 'Maya Chen', email: 'maya@northstar.demo' }, organization: { name: 'Northstar HVAC' }
    }) } } as unknown as PrismaService;
    const controller = new DemoSessionController(prisma); const response = responseFake();
    await expect(controller.create({ identity: 'northstar-owner' }, response)).resolves.toEqual({
      identity: 'northstar-owner', userName: 'Maya Chen', userEmail: 'maya@northstar.demo', role: 'OWNER', organizationName: 'Northstar HVAC'
    });
    expect(response.cookie).toHaveBeenCalledWith('relayops_demo_session', 'demo-session-northstar-v1', expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  });

  it('reports the current server-derived session and clears it on sign-out', () => {
    const controller = new DemoSessionController({} as PrismaService); const response = responseFake();
    expect(controller.current({ organizationId: 'north', userId: 'u1', userName: 'Maya Chen', userEmail: 'maya@northstar.demo', role: 'OWNER' })).toEqual(expect.objectContaining({ identity: 'northstar-owner' }));
    expect(controller.clear(response)).toEqual({ ok: true });
    expect(response.clearCookie).toHaveBeenCalledWith('relayops_demo_session', { path: '/' });
  });

  it('rejects arbitrary identity or organization input', async () => {
    const controller = new DemoSessionController({} as PrismaService);
    await expect(controller.create({ identity: 'some-other-organization' }, responseFake())).rejects.toBeInstanceOf(BadRequestException);
  });
});
