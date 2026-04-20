/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Empty turbopack config to silence the warning
  turbopack: {},
  images: {
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
      // S4 Task 3 — IA consolidation. `permanent: true` emits HTTP 308
      // so bookmarks keep working across customers. These redirects
      // are the contract for pre-S4 URLs; do not remove without a
      // migration plan.
      {
        source: "/dashboard/default",
        destination: "/dashboard",
        permanent: true,
      },
      {
        source: "/dashboard/default/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
      {
        source: "/dashboard/procurement/purchase-orders",
        destination: "/dashboard/inventory/purchase-orders",
        permanent: true,
      },
      {
        source: "/dashboard/procurement/:path*",
        destination: "/dashboard/inventory/:path*",
        permanent: true,
      },
      // Materials moved under Inventory.
      {
        source: "/dashboard/materials",
        destination: "/dashboard/inventory/materials",
        permanent: true,
      },
      {
        source: "/dashboard/materials/:path*",
        destination: "/dashboard/inventory/materials/:path*",
        permanent: true,
      },
      // S4 Task 8 — Cut Planner rebranded to Cutting Engine;
      // batch + manual sub-modes removed. Old sub-paths collapse
      // to the single unified engine route; query params are
      // preserved so `?loadCut=…` deep links keep working.
      {
        source: "/dashboard/cut-planner",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/batch",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/manual",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/:path*",
        destination: "/dashboard/cutting-engine/:path*",
        permanent: true,
      },
      // Nesting Engine was briefly the working name mid-task;
      // keep the redirect so any intermediate links survive.
      {
        source: "/dashboard/nesting-engine",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/nesting-engine/:path*",
        destination: "/dashboard/cutting-engine/:path*",
        permanent: true,
      },
      // S4 Task 9 — Analytics consolidation. Six top-level routes
      // collapsed under /dashboard/analytics/* with a shared tabbed
      // layout. Query strings preserved so filter deep-links survive.
      {
        source: "/dashboard/waste",
        destination: "/dashboard/analytics/waste",
        permanent: true,
      },
      {
        source: "/dashboard/waste-comparison",
        destination: "/dashboard/analytics/waste-comparison",
        permanent: true,
      },
      {
        source: "/dashboard/usage",
        destination: "/dashboard/analytics/usage",
        permanent: true,
      },
      {
        source: "/dashboard/costs",
        destination: "/dashboard/analytics/costs",
        permanent: true,
      },
      {
        source: "/dashboard/trends",
        destination: "/dashboard/analytics/trends",
        permanent: true,
      },
      {
        source: "/dashboard/reports",
        destination: "/dashboard/analytics/reports",
        permanent: true,
      },
      // S4 Task 10 — Settings + account consolidation.
      // `/dashboard/account` folds into Settings → Profile tab.
      {
        source: "/dashboard/account",
        destination: "/dashboard/settings/profile",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
