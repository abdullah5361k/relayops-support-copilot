import {
  JobStatus,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  SubscriptionStatus,
  TicketPriority,
  TicketStatus,
  TradeType
} from '@prisma/client';

const prisma = new PrismaClient();

const ids = {
  northstar: '10000000-0000-4000-8000-000000000001',
  primeflow: '20000000-0000-4000-8000-000000000001',
  starter: '30000000-0000-4000-8000-000000000001',
  growth: '30000000-0000-4000-8000-000000000002',
  northOwner: '11000000-0000-4000-8000-000000000001',
  northDispatcher: '11000000-0000-4000-8000-000000000002',
  northTechUser: '11000000-0000-4000-8000-000000000003',
  primeOwner: '21000000-0000-4000-8000-000000000001',
  primeTechUser: '21000000-0000-4000-8000-000000000002',
  northCustomer1: '12000000-0000-4000-8000-000000000001',
  northCustomer2: '12000000-0000-4000-8000-000000000002',
  primeCustomer1: '22000000-0000-4000-8000-000000000001',
  primeCustomer2: '22000000-0000-4000-8000-000000000002',
  northTech1: '13000000-0000-4000-8000-000000000001',
  northTech2: '13000000-0000-4000-8000-000000000002',
  primeTech1: '23000000-0000-4000-8000-000000000001',
  primeTech2: '23000000-0000-4000-8000-000000000002'
} as const;

async function main() {
  await prisma.$transaction([
    prisma.supportTicket.deleteMany(),
    prisma.job.deleteMany(),
    prisma.technician.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.plan.deleteMany()
  ]);

  await prisma.plan.createMany({ data: [
    { id: ids.starter, code: 'starter', name: 'Starter', seatLimit: 5, monthlyCents: 0 },
    { id: ids.growth, code: 'growth', name: 'Growth Demo', seatLimit: 10, monthlyCents: 0 }
  ] });

  await prisma.organization.createMany({ data: [
    { id: ids.northstar, name: 'Northstar HVAC', slug: 'northstar-hvac', trade: TradeType.HVAC, city: 'Minneapolis, MN' },
    { id: ids.primeflow, name: 'PrimeFlow Plumbing', slug: 'primeflow-plumbing', trade: TradeType.PLUMBING, city: 'Austin, TX' }
  ] });

  await prisma.user.createMany({ data: [
    { id: ids.northOwner, name: 'Maya Chen', email: 'maya@northstar.demo' },
    { id: ids.northDispatcher, name: 'Eli Brooks', email: 'eli@northstar.demo' },
    { id: ids.northTechUser, name: 'Jordan Lee', email: 'jordan@northstar.demo' },
    { id: ids.primeOwner, name: 'Sofia Ramirez', email: 'sofia@primeflow.demo' },
    { id: ids.primeTechUser, name: 'Marcus Green', email: 'marcus@primeflow.demo' }
  ] });

  await prisma.organizationMembership.createMany({ data: [
    { organizationId: ids.northstar, userId: ids.northOwner, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
    { organizationId: ids.northstar, userId: ids.northDispatcher, role: MembershipRole.DISPATCHER, status: MembershipStatus.ACTIVE },
    { organizationId: ids.northstar, userId: ids.northTechUser, role: MembershipRole.TECHNICIAN, status: MembershipStatus.ACTIVE },
    { organizationId: ids.primeflow, userId: ids.primeOwner, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
    { organizationId: ids.primeflow, userId: ids.primeTechUser, role: MembershipRole.TECHNICIAN, status: MembershipStatus.ACTIVE }
  ] });

  await prisma.subscription.createMany({ data: [
    { id: '14000000-0000-4000-8000-000000000001', organizationId: ids.northstar, planId: ids.growth, status: SubscriptionStatus.ACTIVE, startedAt: new Date('2026-01-01T00:00:00Z') },
    { id: '24000000-0000-4000-8000-000000000001', organizationId: ids.primeflow, planId: ids.starter, status: SubscriptionStatus.TRIALING, startedAt: new Date('2026-02-15T00:00:00Z') }
  ] });

  await prisma.customer.createMany({ data: [
    { id: ids.northCustomer1, organizationId: ids.northstar, name: 'Lakeview Bakery', email: 'ops@lakeview.demo', phone: '555-0101', address: '18 Harbor Ave, Minneapolis, MN' },
    { id: ids.northCustomer2, organizationId: ids.northstar, name: 'Juniper Dental', email: 'office@juniper.demo', phone: '555-0102', address: '402 Cedar St, Minneapolis, MN' },
    { id: ids.primeCustomer1, organizationId: ids.primeflow, name: 'Bluebonnet Cafe', email: 'hello@bluebonnet.demo', phone: '555-0201', address: '77 Congress Ave, Austin, TX' },
    { id: ids.primeCustomer2, organizationId: ids.primeflow, name: 'Hill Country Books', email: 'team@hillcountry.demo', phone: '555-0202', address: '910 Lamar Blvd, Austin, TX' }
  ] });

  await prisma.technician.createMany({ data: [
    { id: ids.northTech1, organizationId: ids.northstar, userId: ids.northTechUser, name: 'Jordan Lee', email: 'jordan@northstar.demo', specialty: 'Heat pumps' },
    { id: ids.northTech2, organizationId: ids.northstar, name: 'Avery Singh', email: 'avery@northstar.demo', specialty: 'Commercial HVAC' },
    { id: ids.primeTech1, organizationId: ids.primeflow, userId: ids.primeTechUser, name: 'Marcus Green', email: 'marcus@primeflow.demo', specialty: 'Leak detection' },
    { id: ids.primeTech2, organizationId: ids.primeflow, name: 'Nina Patel', email: 'nina@primeflow.demo', specialty: 'Water heaters' }
  ] });

  await prisma.job.createMany({ data: [
    { id: '15000000-0000-4000-8000-000000000001', organizationId: ids.northstar, customerId: ids.northCustomer1, technicianId: ids.northTech1, reference: 'NH-1042', title: 'Rooftop unit inspection', description: 'Inspect intermittent compressor shutdown.', status: JobStatus.IN_PROGRESS, scheduledFor: new Date('2026-08-03T14:00:00Z') },
    { id: '15000000-0000-4000-8000-000000000002', organizationId: ids.northstar, customerId: ids.northCustomer2, technicianId: ids.northTech2, reference: 'NH-1043', title: 'Cooling tune-up', description: 'Seasonal inspection and filter replacement.', status: JobStatus.SCHEDULED, scheduledFor: new Date('2026-08-04T16:30:00Z') },
    { id: '15000000-0000-4000-8000-000000000003', organizationId: ids.northstar, customerId: ids.northCustomer1, technicianId: ids.northTech1, reference: 'NH-1037', title: 'Walk-in cooler repair', description: 'Replace failed condenser fan motor.', status: JobStatus.COMPLETED, scheduledFor: new Date('2026-07-28T13:00:00Z'), completedAt: new Date('2026-07-28T15:15:00Z') },
    { id: '25000000-0000-4000-8000-000000000001', organizationId: ids.primeflow, customerId: ids.primeCustomer1, technicianId: ids.primeTech1, reference: 'PF-2088', title: 'Kitchen drain backup', description: 'Clear line and inspect for root intrusion.', status: JobStatus.SCHEDULED, scheduledFor: new Date('2026-08-03T15:00:00Z') },
    { id: '25000000-0000-4000-8000-000000000002', organizationId: ids.primeflow, customerId: ids.primeCustomer2, technicianId: ids.primeTech2, reference: 'PF-2084', title: 'Water heater replacement', description: 'Install synthetic demo 50-gallon unit.', status: JobStatus.COMPLETED, scheduledFor: new Date('2026-07-30T14:00:00Z'), completedAt: new Date('2026-07-30T18:00:00Z') }
  ] });

  await prisma.supportTicket.createMany({ data: [
    { id: '16000000-0000-4000-8000-000000000001', organizationId: ids.northstar, customerId: ids.northCustomer1, openedById: ids.northOwner, reference: 'SUP-310', subject: 'How do I reassign a scheduled job?', body: 'Looking for the safest workflow before tomorrow.', status: TicketStatus.OPEN, priority: TicketPriority.NORMAL, createdAt: new Date('2026-08-01T09:00:00Z'), updatedAt: new Date('2026-08-01T09:00:00Z') },
    { id: '16000000-0000-4000-8000-000000000002', organizationId: ids.northstar, openedById: ids.northDispatcher, reference: 'SUP-304', subject: 'Technician seat status', body: 'Confirming how active team seats are counted.', status: TicketStatus.RESOLVED, priority: TicketPriority.LOW, createdAt: new Date('2026-07-25T12:00:00Z'), updatedAt: new Date('2026-07-26T10:00:00Z') },
    { id: '26000000-0000-4000-8000-000000000001', organizationId: ids.primeflow, customerId: ids.primeCustomer2, openedById: ids.primeOwner, reference: 'SUP-422', subject: 'Customer phone number update', body: 'Need help correcting a synthetic customer contact.', status: TicketStatus.IN_PROGRESS, priority: TicketPriority.NORMAL, createdAt: new Date('2026-08-01T11:30:00Z'), updatedAt: new Date('2026-08-01T13:00:00Z') }
  ] });

  console.log('Seeded Northstar HVAC and PrimeFlow Plumbing demo tenants.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
