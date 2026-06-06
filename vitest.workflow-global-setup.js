/**
 * Custom vitest globalSetup for workflow integration tests.
 *
 * Uses a custom builder that sets bundleTransitiveLocalStepDependencies: true
 * so workspace packages like @proctor/engine (TypeScript source, no build step)
 * are bundled directly into steps.mjs rather than externalized.
 */

// @ts-check
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BaseBuilder, createBaseBuilderConfig } from "@workflow/builders";
import { initDataDir } from "@workflow/world-local";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// cwd must match the process.chdir() in vitest.integration.config.ts so that
// workflowId paths agree between the transform plugin and the builder.
const workflowsDir = resolve(__dirname, "workflows");
const outDir = join(workflowsDir, ".workflow-vitest");
const dataDir = join(workflowsDir, ".workflow-data");

class PatchedVitestBuilder extends BaseBuilder {
  #outDir;

  constructor(workingDir, out) {
    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: ["."],
      }),
      buildTarget: "next",
      suppressCreateWorkflowsBundleLogs: true,
      suppressCreateWebhookBundleLogs: true,
      suppressCreateManifestLogs: true,
    });
    this.#outDir = out;
  }

  get shouldLogBaseBuilderInfo() {
    return false;
  }

  async build() {
    const inputFiles = await this.getInputFiles();
    await mkdir(this.#outDir, { recursive: true });
    await this.createWorkflowsBundle({
      outfile: join(this.#outDir, "workflows.mjs"),
      bundleFinalOutput: false,
      format: "esm",
      inputFiles,
    });
    await this.createStepsBundle({
      outfile: join(this.#outDir, "steps.mjs"),
      externalizeNonSteps: true,
      rewriteTsExtensions: true,
      format: "esm",
      inputFiles,
    });
  }
}

export async function setup() {
  const builder = new PatchedVitestBuilder(workflowsDir, outDir);
  await builder.build();
  await initDataDir(dataDir);
}
