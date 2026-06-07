/**
 * Custom vitest setupFiles for workflow integration tests.
 * Mirrors @workflow/vitest's setup-file.js but passes options directly
 * (since we're not using the workflow() plugin which provides them via inject()).
 */

// @ts-check
import { afterAll } from "vitest";
import { setupWorkflowTests, teardownWorkflowTests } from "@workflow/vitest";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const workflowsDir = resolve(__dirname, "workflows");

await setupWorkflowTests({
  cwd: workflowsDir,
  dataDir: join(workflowsDir, ".workflow-data"),
  outDir: join(workflowsDir, ".workflow-vitest"),
});

afterAll(async () => {
  await teardownWorkflowTests();
});
