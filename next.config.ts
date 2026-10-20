import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    // Reuse dynamic (server-prefetched) page payloads in the client router
    // cache for 30s so returning to a page does not re-run its DB queries.
    // TanStack Query still revalidates in the background per its own staleTime.
    staleTimes: { dynamic: 30 },
  },
  // Allow the LAN addresses used to open the development server from another
  // device. When the current host is missing, Next blocks client assets/HMR;
  // interactive forms then degrade to a native GET submission.
  allowedDevOrigins: ["192.168.1.35", "192.168.1.46"],
};

export default nextConfig;
