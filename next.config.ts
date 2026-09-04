import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers ships ONNX/WASM assets that must not be bundled;
  // load it from node_modules at runtime instead.
  serverExternalPackages: ["@xenova/transformers"],
};

export default nextConfig;
