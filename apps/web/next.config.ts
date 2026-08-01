import type { NextConfig } from 'next';

const frontendOnlyPreview = process.env.NEXT_PUBLIC_RELAYOPS_DEPLOYMENT_MODE === 'frontend-preview';
const apiUrl = frontendOnlyPreview ? undefined : (process.env.RELAYOPS_API_INTERNAL_URL ?? 'http://127.0.0.1:3001');

const nextConfig: NextConfig = {
  output: frontendOnlyPreview ? 'export' : undefined,
  poweredByHeader: false,
  transpilePackages: ['@relayops/contracts', '@relayops/widget'],
  ...(apiUrl ? { rewrites: async () => [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }] } : {})
};

export default nextConfig;
