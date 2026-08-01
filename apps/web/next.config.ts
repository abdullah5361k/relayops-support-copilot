import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@relayops/contracts', '@relayops/widget']
};

export default nextConfig;
