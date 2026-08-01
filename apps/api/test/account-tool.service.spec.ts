import { HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AccountToolException } from '../src/account-tools/account-tool.exception';
import { AccountToolService } from '../src/account-tools/account-tool.service';
import type { TenantContextValue } from '../src/auth/tenant-context';

const north: TenantContextValue = { organizationId: 'north', userId: 'maya', userName: 'Maya', userEmail: 'maya@northstar.demo', role: 'OWNER' };

function fakePrisma() {
  const audits: unknown[] = [];
  return {
    audits,
    job: { findUnique: jest.fn(({ where }) => Promise.resolve(where.organizationId_reference.organizationId === 'north' && where.organizationId_reference.reference === 'NH-1' ? { reference: 'NH-1', status: 'IN_PROGRESS' } : null)) },
    supportTicket: { findUnique: jest.fn(() => Promise.resolve(null)) },
    subscription: { findUnique: jest.fn(() => Promise.resolve({ status: 'ACTIVE', plan: { name: 'Growth Demo', seatLimit: 10 } })) },
    organizationMembership: { count: jest.fn(() => Promise.resolve(3)) },
    handoffDraft: { updateMany: jest.fn(() => Promise.resolve({ count: 0 })), create: jest.fn() },
    toolAudit: { create: jest.fn(({ data }) => { audits.push(data); return Promise.resolve(data); }) }
  };
}

describe('AccountToolService narrow authorization boundary', () => {
  it('uses the server context in its compound reference lookup and returns no job details', async () => {
    const fake = fakePrisma(); const service = new AccountToolService(fake as unknown as PrismaService);
    await expect(service.jobStatus(north, 'NH-1')).resolves.toEqual({ kind: 'job_status', reference: 'NH-1', status: 'IN_PROGRESS' });
    expect(fake.job.findUnique).toHaveBeenCalledWith({ where: { organizationId_reference: { organizationId: 'north', reference: 'NH-1' }, }, select: { reference: true, status: true } });
    await expect(service.jobStatus(north, 'PF-1')).rejects.toMatchObject({ code: 'not_found', status: HttpStatus.NOT_FOUND });
  });

  it('rejects malformed references and records only sanitized audit arguments', async () => {
    const fake = fakePrisma(); const service = new AccountToolService(fake as unknown as PrismaService);
    await expect(service.jobStatus(north, 'PF-1?organizationId=prime')).rejects.toBeInstanceOf(AccountToolException);
    expect(fake.audits).toEqual([expect.objectContaining({ organizationId: 'north', actorId: 'maya', toolName: 'job_status', outcome: 'invalid_argument', sanitizedArguments: { reference: 'PF-1?organizationId=prime' } })]);
  });

  it('does not retain preview content in audit records even when authority fields are supplied', async () => {
    const fake = fakePrisma(); const service = new AccountToolService(fake as unknown as PrismaService);
    await expect(service.previewHandoff(north, { summary: 'private synthetic text', documentationEvidence: [], conversationExcerpt: 'do not audit', organizationId: 'prime' })).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(fake.audits).toEqual([expect.objectContaining({
      toolName: 'handoff_preview', outcome: 'invalid_argument',
      sanitizedArguments: { validShape: false, summaryLength: 22, conversationExcerptLength: 12, documentationEvidenceCount: 0 }
    })]);
    expect(JSON.stringify(fake.audits)).not.toContain('private synthetic text');
    expect(JSON.stringify(fake.audits)).not.toContain('do not audit');
  });
});
