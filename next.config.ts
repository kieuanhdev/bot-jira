import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Allow the LAN addresses used to open the development server from another
  // device. When the current host is missing, Next blocks client assets/HMR;
  // interactive forms then degrade to a native GET submission.
  allowedDevOrigins: ["192.168.1.35", "192.168.1.46"],
};

export default nextConfig;
