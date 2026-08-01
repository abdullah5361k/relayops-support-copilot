import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, MembershipStatus } from '@prisma/client';
import type { DashboardData, DashboardJob, SupportTicketSummary, TeamMember } from '@relayops/contracts';
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
    return jobs.map((job) => ({
      id: job.id,
      reference: job.reference,
      title: job.title,
      customerName: job.customer.name,
      technicianName: job.technician?.name ?? null,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString()
    }));
  }

  async job(tenant: TenantContextValue, id: string): Promise<DashboardJob> {
    const job = await this.prisma.job.findUnique({
      where: { organizationId_id: { organizationId: tenant.organizationId, id } },
      include: { customer: true, technician: true }
    });
    if (!job) throw new NotFoundException('Job not found');
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

  async subscription(tenant: TenantContextValue) {
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
      status: subscription.status
    };
  }

  async tickets(tenant: TenantContextValue): Promise<SupportTicketSummary[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { createdAt: 'desc' }
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString()
    }));
  }

  async dashboard(tenant: TenantContextValue): Promise<DashboardData> {
    const [organization, jobs, team, subscription, tickets, activeCustomers, completedJobs] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: tenant.organizationId } }),
      this.jobs(tenant),
      this.team(tenant),
      this.subscription(tenant),
      this.tickets(tenant),
      this.prisma.customer.count({ where: { organizationId: tenant.organizationId, active: true } }),
      this.prisma.job.count({ where: { organizationId: tenant.organizationId, status: JobStatus.COMPLETED } })
    ]);
    if (!organization) throw new NotFoundException('Organization not found');

    return {
      organization: { name: organization.name, trade: organization.trade, city: organization.city },
      viewer: { name: tenant.userName, email: tenant.userEmail, role: tenant.role },
      metrics: {
        openJobs: jobs.filter((job) => job.status === 'SCHEDULED' || job.status === 'IN_PROGRESS').length,
        completedThisMonth: completedJobs,
        activeCustomers
      },
      subscription,
      jobs,
      team,
      tickets
    };
  }
}
