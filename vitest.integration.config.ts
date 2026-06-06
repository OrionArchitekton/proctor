/**
 * Integration test config for workflow pause/resume tests.
 *
 * We use manual globalSetup + setupFiles rather than the workflow() plugin
 * because the plugin's default VitestBuilder externalizes @proctor/* workspace
 * packages, which are TypeScript source with no pre-built .js output and fail
 * at Node.js ESM runtime.  Our custom global setup sets
 * bundleTransitiveLocalStepDependencies:true so those packages are bundled
 * inline into steps.mjs.
 *
 * The workflowTransformPlugin (from @workflow/rollup) still runs to handle
 * "use workflow" / "use step" directive transforms during Vite/vitest's
 * compilation of test source files.
 *
 * process.chdir("workflows/") aligns the transform plugin's process.cwd()-
 * based ID generation with the builder's cwd, so workflowId values match
 * between the source-module metadata and the bundle.
 */

import { defineConfig } from "vitest/config";
import { workflowTransformPlugin } from "@workflow/rollup";
import { resolve } from "node:path";

const workflowsDir = resolve(__dirname, "workflows");

// Align process.cwd() with the builder's cwd so workflowId paths match.
// Both the transform plugin (process.cwd()) and the builder (cwd option)
// must use the same root when computing relative module IDs.
process.chdir(workflowsDir);

export default defineConfig({
  plugins: [
    workflowTransformPlugin({
      // Exclude generated bundles from being re-processed.
      exclude: [resolve(workflowsDir, ".workflow-vitest") + "/"],
    }),
  ],
  test: {
    include: ["**/*.integration.test.ts"],
    testTimeout: 60_000,
    globalSetup: [resolve(__dirname, "vitest.workflow-global-setup.js")],
    setupFiles: [resolve(__dirname, "vitest.workflow-setup-file.js")],
    // Register the tsx TypeScript ESM loader in worker processes so that the
    // step executor can import @proctor/* workspace packages (TypeScript source
    // with no pre-built .js output) that are externalized from steps.mjs.
    poolOptions: {
      forks: {
        execArgv: ["--import", "tsx/esm"],
      },
    },
  },
});
