import { withWorkflow } from "workflow/next";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  transpilePackages: [
    "@proctor/shared",
    "@proctor/engine",
    "@proctor/sut-invoice",
    "@proctor/uipath",
    "@proctor/workflows",
  ],
  webpack(config) {
    // Allow webpack to resolve .js extension imports to their .ts source files
    // when transpilePackages is in use (workspace packages use ESM .js imports).
    const existing: Record<string, string[]> =
      (config.resolve?.extensionAlias as Record<string, string[]>) ?? {};
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        ...existing,
        ".js": [".ts", ".tsx", ".js"],
        ".mjs": [".mts", ".mjs"],
      },
    };
    return config;
  },
};

export default withWorkflow(nextConfig);
