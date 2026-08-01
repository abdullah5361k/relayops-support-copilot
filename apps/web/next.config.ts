import type { NextConfig } from 'next';

const apiUrl = process.env.RELAYOPS_API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@relayops/contracts', '@relayops/widget'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  }
};

export default nextConfig;
