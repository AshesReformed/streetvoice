import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers and twilio ship assets/bindings that must not be
  // bundled; load them from node_modules at runtime instead.
  serverExternalPackages: ["@xenova/transformers", "twilio"],
};

export default nextConfig;
