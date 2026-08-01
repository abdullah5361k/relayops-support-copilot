import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RelayOps | Field service, clearly coordinated',
  description: 'The zero-cost foundation for a fictional multi-tenant field-service SaaS portfolio project.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
