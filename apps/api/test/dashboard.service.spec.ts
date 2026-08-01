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
  const customers = [
    { id: 'north-customer', organizationId: 'north', name: 'North customer', email: null, phone: '555-1', address: 'North', active: true, _count: { jobs: 1 }, jobs: [{ scheduledFor: at }] },
    { id: 'prime-customer', organizationId: 'prime', name: 'Prime customer', email: null, phone: '555-2', address: 'Prime', active: true, _count: { jobs: 1 }, jobs: [{ scheduledFor: at }] }
  ];
  const tickets = [
    { id: 'north-ticket', organizationId: 'north', reference: 'SUP-N', subject: 'North only', status: 'OPEN', createdAt: at, updatedAt: at, openedBy: { name: 'Maya' } },
    { id: 'prime-ticket', organizationId: 'prime', reference: 'SUP-P', subject: 'Prime only', status: 'RESOLVED', createdAt: at, updatedAt: at, openedBy: { name: 'Sofia' } }
  ];
  const subscriptions = {
    north: { organizationId: 'north', status: 'ACTIVE', startedAt: at, plan: { name: 'Growth Demo', seatLimit: 10, monthlyCents: 0 } },
    prime: { organizationId: 'prime', status: 'TRIALING', startedAt: at, plan: { name: 'Starter', seatLimit: 5, monthlyCents: 0 } }
  };
  const seatCounts = { north: 3, prime: 2 };
  return {
    job: {
      findMany: jest.fn(({ where }) => Promise.resolve(jobs.filter((job) => job.organizationId === where.organizationId))),
      findUnique: jest.fn(({ where }) => Promise.resolve(jobs.find((job) => job.organizationId === where.organizationId_id.organizationId && job.id === where.organizationId_id.id) ?? null)),
      count: jest.fn(() => Promise.resolve(1))
    },
    customer: {
      findMany: jest.fn(({ where }) => Promise.resolve(customers.filter((customer) => customer.organizationId === where.organizationId))),
      findUnique: jest.fn(({ where }) => Promise.resolve(customers.find((customer) => customer.organizationId === where.organizationId_id.organizationId && customer.id === where.organizationId_id.id) ?? null)),
      count: jest.fn(() => Promise.resolve(2))
    },
    supportTicket: {
      findMany: jest.fn(({ where }) => Promise.resolve(tickets.filter((ticket) => ticket.organizationId === where.organizationId))),
      count: jest.fn(() => Promise.resolve(1))
    },
    subscription: { findUnique: jest.fn(({ where }) => Promise.resolve(subscriptions[where.organizationId as keyof typeof subscriptions] ?? null)) },
    organizationMembership: { count: jest.fn(({ where }) => Promise.resolve(seatCounts[where.organizationId as keyof typeof seatCounts] ?? 0)) },
    technician: { findMany: jest.fn(() => Promise.resolve([])) },
    organization: { findUnique: jest.fn(({ where }) => Promise.resolve({ id: where.id, name: where.id === 'north' ? 'Northstar HVAC' : 'PrimeFlow Plumbing', trade: 'HVAC', city: 'Demo' })) }
  };
}

describe('DashboardService tenant isolation', () => {
  it('scopes job lists and rejects a cross-tenant job lookup', async () => {
    const fake = createPrismaFake(); const service = new DashboardService(fake as unknown as PrismaService);
    await expect(service.jobs(north)).resolves.toEqual([expect.objectContaining({ id: 'north-job' })]);
    await expect(service.jobs(prime)).resolves.toEqual([expect.objectContaining({ id: 'prime-job' })]);
    await expect(service.job(north, 'prime-job')).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.job.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_id: { organizationId: 'north', id: 'prime-job' } } }));
  });

  it('scopes customers and denies another tenant customer by compound key', async () => {
    const fake = createPrismaFake(); const service = new DashboardService(fake as unknown as PrismaService);
    await expect(service.customers(north)).resolves.toEqual([expect.objectContaining({ id: 'north-customer', name: 'North customer' })]);
    await expect(service.customers(prime)).resolves.toEqual([expect.objectContaining({ id: 'prime-customer', name: 'Prime customer' })]);
    await expect(service.customer(north, 'prime-customer')).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_id: { organizationId: 'north', id: 'prime-customer' } } }));
  });

  it('isolates subscription usage and tickets for each organization', async () => {
    const service = new DashboardService(createPrismaFake() as unknown as PrismaService);
    await expect(service.subscription(north)).resolves.toMatchObject({ planName: 'Growth Demo', seatsUsed: 3, seatLimit: 10 });
    await expect(service.subscription(prime)).resolves.toMatchObject({ planName: 'Starter', seatsUsed: 2, seatLimit: 5 });
    expect((await service.tickets(north)).map((ticket) => ticket.id)).toEqual(['north-ticket']);
    expect((await service.tickets(prime)).map((ticket) => ticket.id)).toEqual(['prime-ticket']);
  });

  it('assembles dashboard metrics only from scoped queries', async () => {
    const fake = createPrismaFake(); const dashboard = await new DashboardService(fake as unknown as PrismaService).dashboard(north);
    expect(dashboard.organization.name).toBe('Northstar HVAC');
    expect(dashboard.viewer.email).toBe('maya@northstar.demo');
    expect(dashboard.metrics.openTickets).toBe(1);
    expect(fake.supportTicket.count).toHaveBeenCalledWith({ where: { organizationId: 'north', status: { not: 'RESOLVED' } } });
  });
});
