import { NotFoundException } from '@nestjs/common';
import { DashboardService } from '../src/dashboard/dashboard.service';
import type { TenantContextValue } from '../src/auth/tenant-context';
import type { PrismaService } from '../src/prisma/prisma.service';

const north: TenantContextValue = { organizationId: 'north', userId: 'u1', userName: 'Maya', userEmail: 'maya@northstar.demo', role: 'OWNER' };
const prime: TenantContextValue = { organizationId: 'prime', userId: 'u2', userName: 'Sofia', userEmail: 'sofia@primeflow.demo', role: 'OWNER' };
const at = new Date('2026-08-03T12:00:00Z');

function createPrismaFake() {
  const jobs = [
    { id: 'north-job', organizationId: 'north', reference: 'NH-1', title: 'North job', status: 'SCHEDULED', scheduledFor: at, customer: { name: 'North customer' }, technician: { name: 'North tech' } },
    { id: 'prime-job', organizationId: 'prime', reference: 'PF-1', title: 'Prime job', status: 'IN_PROGRESS', scheduledFor: at, customer: { name: 'Prime customer' }, technician: { name: 'Prime tech' } }
  ];
  const tickets = [
    { id: 'north-ticket', organizationId: 'north', reference: 'SUP-N', subject: 'North only', status: 'OPEN', createdAt: at },
    { id: 'prime-ticket', organizationId: 'prime', reference: 'SUP-P', subject: 'Prime only', status: 'RESOLVED', createdAt: at }
  ];
  const subscriptions = {
    north: { organizationId: 'north', status: 'ACTIVE', plan: { name: 'Growth Demo', seatLimit: 10 } },
    prime: { organizationId: 'prime', status: 'TRIALING', plan: { name: 'Starter', seatLimit: 5 } }
  };
  const seatCounts = { north: 3, prime: 2 };

  return {
    job: {
      findMany: jest.fn(({ where }) => Promise.resolve(jobs.filter((job) => job.organizationId === where.organizationId))),
      findUnique: jest.fn(({ where }) => Promise.resolve(jobs.find((job) => job.organizationId === where.organizationId_id.organizationId && job.id === where.organizationId_id.id) ?? null)),
      count: jest.fn(() => Promise.resolve(1))
    },
    supportTicket: {
      findMany: jest.fn(({ where }) => Promise.resolve(tickets.filter((ticket) => ticket.organizationId === where.organizationId)))
    },
    subscription: {
      findUnique: jest.fn(({ where }) => Promise.resolve(subscriptions[where.organizationId as keyof typeof subscriptions] ?? null))
    },
    organizationMembership: {
      count: jest.fn(({ where }) => Promise.resolve(seatCounts[where.organizationId as keyof typeof seatCounts] ?? 0))
    },
    technician: { findMany: jest.fn(() => Promise.resolve([])) },
    organization: { findUnique: jest.fn(({ where }) => Promise.resolve({ id: where.id, name: where.id === 'north' ? 'Northstar HVAC' : 'PrimeFlow Plumbing', trade: 'HVAC', city: 'Demo' })) },
    customer: { count: jest.fn(() => Promise.resolve(2)) }
  };
}

describe('DashboardService tenant isolation', () => {
  it('scopes job lists and rejects a cross-tenant job lookup', async () => {
    const fake = createPrismaFake();
    const service = new DashboardService(fake as unknown as PrismaService);

    await expect(service.jobs(north)).resolves.toEqual([expect.objectContaining({ id: 'north-job' })]);
    await expect(service.jobs(prime)).resolves.toEqual([expect.objectContaining({ id: 'prime-job' })]);
    await expect(service.job(north, 'prime-job')).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.job.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_id: { organizationId: 'north', id: 'prime-job' } }
    }));
  });

  it('isolates subscription seat usage for each organization', async () => {
    const service = new DashboardService(createPrismaFake() as unknown as PrismaService);
    await expect(service.subscription(north)).resolves.toEqual({ planName: 'Growth Demo', seatsUsed: 3, seatLimit: 10, status: 'ACTIVE' });
    await expect(service.subscription(prime)).resolves.toEqual({ planName: 'Starter', seatsUsed: 2, seatLimit: 5, status: 'TRIALING' });
  });

  it('never returns the other tenant tickets', async () => {
    const service = new DashboardService(createPrismaFake() as unknown as PrismaService);
    const northTickets = await service.tickets(north);
    const primeTickets = await service.tickets(prime);
    expect(northTickets.map((ticket) => ticket.id)).toEqual(['north-ticket']);
    expect(primeTickets.map((ticket) => ticket.id)).toEqual(['prime-ticket']);
  });

  it('assembles the principal dashboard response from scoped queries', async () => {
    const service = new DashboardService(createPrismaFake() as unknown as PrismaService);
    const dashboard = await service.dashboard(north);
    expect(dashboard.organization.name).toBe('Northstar HVAC');
    expect(dashboard.viewer.email).toBe('maya@northstar.demo');
    expect(dashboard.jobs).toHaveLength(1);
    expect(dashboard.subscription.seatsUsed).toBe(3);
    expect(dashboard.tickets[0]?.reference).toBe('SUP-N');
  });
});
