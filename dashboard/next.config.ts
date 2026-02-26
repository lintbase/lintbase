import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // firebase-admin uses native Node.js modules — tell Next.js not to bundle it.
  // It will be loaded at runtime by the serverless function instead.
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
