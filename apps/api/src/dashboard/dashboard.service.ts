import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, MembershipStatus, TicketStatus } from '@prisma/client';
import type {
  CustomerSummary,
  DashboardData,
  DashboardJob,
  SubscriptionSummary,
  SupportTicketSummary,
  TeamMember
} from '@relayops/contracts';
import type { TenantContextValue } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async jobs(tenant: TenantContextValue): Promise<DashboardJob[]> {
    const jobs = await this.prisma.job.findMany({
      where: { organizationId: tenant.organizationId },
      include: { customer: true, technician: true },
      orderBy: { scheduledFor: 'asc' }
    });
    return jobs.map((job) => this.mapJob(job));
  }

  async job(tenant: TenantContextValue, id: string): Promise<DashboardJob> {
    const job = await this.prisma.job.findUnique({
      where: { organizationId_id: { organizationId: tenant.organizationId, id } },
      include: { customer: true, technician: true }
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.mapJob(job);
  }

  async team(tenant: TenantContextValue): Promise<TeamMember[]> {
    const technicians = await this.prisma.technician.findMany({
      where: { organizationId: tenant.organizationId, active: true },
      orderBy: { name: 'asc' }
    });
    return technicians.map((technician) => ({
      id: technician.id,
      name: technician.name,
      email: technician.email,
      role: 'Technician',
      specialty: technician.specialty
    }));
  }

  async customers(tenant: TenantContextValue): Promise<CustomerSummary[]> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: tenant.organizationId },
      include: {
        _count: { select: { jobs: true } },
        jobs: { select: { scheduledFor: true }, orderBy: { scheduledFor: 'desc' }, take: 1 }
      },
      orderBy: { name: 'asc' }
    });
    return customers.map((customer) => this.mapCustomer(customer));
  }

  async customer(tenant: TenantContextValue, id: string): Promise<CustomerSummary> {
    const customer = await this.prisma.customer.findUnique({
      where: { organizationId_id: { organizationId: tenant.organizationId, id } },
      include: {
        _count: { select: { jobs: true } },
        jobs: { select: { scheduledFor: true }, orderBy: { scheduledFor: 'desc' }, take: 1 }
      }
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.mapCustomer(customer);
  }

  async subscription(tenant: TenantContextValue): Promise<SubscriptionSummary> {
    const [subscription, seatsUsed] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { organizationId: tenant.organizationId },
        include: { plan: true }
      }),
      this.prisma.organizationMembership.count({
        where: { organizationId: tenant.organizationId, status: MembershipStatus.ACTIVE }
      })
    ]);
    if (!subscription) throw new NotFoundException('Subscription not found');
    return {
      planName: subscription.plan.name,
      seatsUsed,
      seatLimit: subscription.plan.seatLimit,
      status: subscription.status,
      monthlyCents: subscription.plan.monthlyCents,
      startedAt: subscription.startedAt.toISOString()
    };
  }

  async tickets(tenant: TenantContextValue): Promise<SupportTicketSummary[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId: tenant.organizationId },
      include: { openedBy: true },
      orderBy: { updatedAt: 'desc' }
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      requesterName: ticket.openedBy.name,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString()
    }));
  }

  async dashboard(tenant: TenantContextValue): Promise<DashboardData> {
    const [organization, jobs, team, subscription, tickets, activeCustomers, completedJobs, openTickets] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: tenant.organizationId } }),
      this.jobs(tenant),
      this.team(tenant),
      this.subscription(tenant),
      this.tickets(tenant),
      this.prisma.customer.count({ where: { organizationId: tenant.organizationId, active: true } }),
      this.prisma.job.count({ where: { organizationId: tenant.organizationId, status: JobStatus.COMPLETED } }),
      this.prisma.supportTicket.count({ where: { organizationId: tenant.organizationId, status: { not: TicketStatus.RESOLVED } } })
    ]);
    if (!organization) throw new NotFoundException('Organization not found');

    return {
      organization: { name: organization.name, trade: organization.trade, city: organization.city },
      viewer: { name: tenant.userName, email: tenant.userEmail, role: tenant.role },
      metrics: {
        openJobs: jobs.filter((job) => job.status === 'SCHEDULED' || job.status === 'IN_PROGRESS').length,
        completedThisMonth: completedJobs,
        activeCustomers,
        openTickets
      },
      subscription,
      jobs,
      team,
      tickets
    };
  }

  private mapJob(job: {
    id: string; reference: string; title: string; status: JobStatus; scheduledFor: Date;
    customer: { name: string }; technician: { name: string } | null;
  }): DashboardJob {
    return {
      id: job.id,
      reference: job.reference,
      title: job.title,
      customerName: job.customer.name,
      technicianName: job.technician?.name ?? null,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString()
    };
  }

  private mapCustomer(customer: {
    id: string; name: string; email: string | null; phone: string; address: string; active: boolean;
    _count: { jobs: number }; jobs: { scheduledFor: Date }[];
  }): CustomerSummary {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      active: customer.active,
      jobCount: customer._count.jobs,
      lastServiceAt: customer.jobs[0]?.scheduledFor.toISOString() ?? null
    };
  }
}
