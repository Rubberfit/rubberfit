/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Empty turbopack config to silence the warning
  turbopack: {},
  // Output configuration for Electron
  output: process.env.ELECTRON_BUILD === 'true' ? 'export' : undefined,
  // Disable image optimization for Electron builds
  images: {
    unoptimized: process.env.ELECTRON_BUILD === 'true',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
  // Webpack configuration for Electron
  webpack: (config, { isServer }) => {
    if (process.env.ELECTRON_BUILD === 'true') {
      config.target = 'electron-renderer';
    }
    return config;
  },
};

export default nextConfig;
