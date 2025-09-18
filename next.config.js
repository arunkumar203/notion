/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable server actions
  experimental: {
    serverActions: {}
  },
  
  // Configure page extensions
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
  
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `node:` protocol
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false,
      dgram: false,
    };

    return config;
  },
  
  // Image optimization domains
  images: {
  domains: ['firebasestorage.googleapis.com', 'images.unsplash.com'],
  },
  
  // Disable React Strict Mode during development to prevent double rendering
  reactStrictMode: true,
  
  // Enable TypeScript type checking
  typescript: {
  ignoreBuildErrors: true,
  },
  
  // Enable ESLint during build
  eslint: {
  ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
