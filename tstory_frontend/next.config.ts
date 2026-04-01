import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 로컬 개발용 rewrites (Vercel에서는 vercel.json이 우선됨)
  async rewrites() {
    // production에서는 vercel.json에서 처리
    if (process.env.VERCEL) return [];
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3020/api/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://localhost:3020/auth/:path*',
      },
    ];
  },
};

export default nextConfig;
