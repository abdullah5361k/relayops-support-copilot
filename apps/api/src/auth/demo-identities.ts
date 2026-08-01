import type { DemoIdentity } from '@relayops/contracts';

export interface DemoProfile {
  identity: DemoIdentity;
  sessionToken: string;
  email: string;
  organizationSlug: string;
  label: string;
}

export const demoProfiles: readonly DemoProfile[] = [
  {
    identity: 'northstar-owner',
    sessionToken: 'demo-session-northstar-v1',
    email: 'maya@northstar.demo',
    organizationSlug: 'northstar-hvac',
    label: 'Maya at Northstar HVAC'
  },
  {
    identity: 'primeflow-owner',
    sessionToken: 'demo-session-primeflow-v1',
    email: 'sofia@primeflow.demo',
    organizationSlug: 'primeflow-plumbing',
    label: 'Sofia at PrimeFlow Plumbing'
  }
] as const;

export const demoSessionCookie = 'relayops_demo_session';
