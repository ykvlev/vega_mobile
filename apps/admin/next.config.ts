import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next 16.4.3 supports experimental.cpus. Limit page-generation workers in CI.
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
