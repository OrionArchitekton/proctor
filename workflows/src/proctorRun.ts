/**
 * proctorRun.ts — fan-out workflow that starts one proctorCycle per SUT,
 * ordered by risk.
 *
 * `start()` from `workflow/api` CANNOT be called directly inside a
 * "use workflow" function (no direct Node/fetch access in the workflow sandbox).
 * It must be wrapped in a "use step" function so the DevKit compiler can hoist
 * it out of the workflow context.
 */

import { start } from "workflow/api";
import type { SutRef, ChangeContext } from "@proctor/shared";
import { loadContractsAndOrderStep } from "./steps.js";
import { proctorCycle } from "./proctorCycle.js";

async function startCycleStep(
  sut: SutRef,
  change: ChangeContext,
): Promise<string> {
  "use step";
  const run = await start(proctorCycle, [sut, change]);
  return run.runId;
}

export async function proctorRun(change: ChangeContext, modelLabel: string) {
  "use workflow";
  const order = await loadContractsAndOrderStep(change);
  const runIds: string[] = [];
  for (const sutId of order) {
    runIds.push(
      await startCycleStep({ id: sutId, modelLabel }, change),
    );
  }
  return { runIds };
}
