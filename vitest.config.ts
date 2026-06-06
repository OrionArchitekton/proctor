import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "workflows/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
