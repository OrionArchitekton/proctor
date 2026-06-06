/**
 * Integration test: pause/resume for proctorCycle.
 *
 * This test exercises the real Workflow DevKit runtime (via @workflow/vitest),
 * genuinely suspending at the createHook() call and resuming via resumeHook().
 *
 * Environment is set before any imports so that fake-LLM path is active from
 * the moment modules initialise.
 */

// ── env setup (must precede all workspace imports) ─────────────────────────
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Allocate a temp dir synchronously so we can set the env var before any
// module that reads PROCTOR_DATA_DIR is imported.
const dataDir = mkdtempSync(join(tmpdir(), "proctor-integration-"));
process.env["PROCTOR_FAKE_LLM"] = "1";
process.env["PROCTOR_GATEWAY"] = "local";
process.env["PROCTOR_DATA_DIR"] = dataDir;

// ── test imports ────────────────────────────────────────────────────────────
import { afterAll, describe, expect, it } from "vitest";
import { start, resumeHook } from "workflow/api";
import { waitForHook } from "@workflow/vitest";

import { learnAndStore } from "./bootstrap.js";
import { proctorCycle } from "./proctorCycle.js";

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("proctorCycle pause/resume integration", () => {
  it("suspends at hook and resumes with approval decision", async () => {
    // 1. Bootstrap: learn and persist a contract for the invoice SUT.
    //    Must use start() — calling learnAndStore directly would bypass the
    //    workflow runtime and break "use step" sandboxing.
    const bootstrapRun = await start(learnAndStore, [
      { id: "invoice", modelLabel: "good" },
    ]);
    await bootstrapRun.returnValue;

    // 2. Start a cycle with the degraded model so a real regression occurs
    //    and the hook is reached.
    const run = await start(proctorCycle, [
      { id: "invoice", modelLabel: "degraded" },
      { changeId: "c1", sutId: "invoice", touched: ["model"] },
    ]);

    // 3. Wait until the workflow has created the approval hook (it is now
    //    suspended at `await hook` inside proctorCycle).
    await waitForHook(run, { token: "approve:invoice:c1" });

    // 4. Resume the hook — this unblocks the workflow.
    await resumeHook("approve:invoice:c1", {
      approved: true,
      reviewer: "alice",
    });

    // 5. Collect the return value.
    const result = await run.returnValue;

    // 6. Assert expected outcome: degraded model → real-regression, approved.
    expect(result.status).toBe("real-regression");
    expect(result.approved).toBe(true);
  });
});
