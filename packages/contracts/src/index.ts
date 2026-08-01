export const demoIdentities = ['northstar-owner', 'primeflow-owner'] as const;
export type DemoIdentity = (typeof demoIdentities)[number];

export type JobStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface OrganizationSummary {
  name: string;
  trade: string;
  city: string;
}

export interface DashboardJob {
  id: string;
  reference: string;
  title: string;
  customerName: string;
  technicianName: string | null;
  status: JobStatus;
  scheduledFor: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  specialty: string;
}

export interface SupportTicketSummary {
  id: string;
  reference: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
}

export interface DashboardData {
  organization: OrganizationSummary;
  viewer: { name: string; email: string; role: string };
  metrics: {
    openJobs: number;
    completedThisMonth: number;
    activeCustomers: number;
  };
  subscription: {
    planName: string;
    seatsUsed: number;
    seatLimit: number;
    status: string;
  };
  jobs: DashboardJob[];
  team: TeamMember[];
  tickets: SupportTicketSummary[];
}

export interface DemoSessionResponse {
  identity: DemoIdentity;
  userName: string;
  organizationName: string;
}
