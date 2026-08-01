import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@relayops/contracts', '@relayops/widget']
};

export default nextConfig;
