/**
 * proctorCycle.ts — durable workflow for a single SUT regression check.
 *
 * FatalError is exported from `workflow` (re-exported from @workflow/errors via @workflow/core).
 * createHook is also from `workflow`.
 */

import { createHook, FatalError } from "workflow";
import type { SutRef, ChangeContext, ApprovalDecision } from "@proctor/shared";
import {
  loadGoldenInputsStep,
  loadContractStep,
  runContractStep,
  classifyDriftStep,
  notifyReviewerStep,
  versionContractStep,
  pushToUiPathStep,
} from "./steps.js";

export async function proctorCycle(sut: SutRef, change: ChangeContext) {
  "use workflow";
  const golden = await loadGoldenInputsStep();
  const contract = await loadContractStep(sut.id);
  if (!contract)
    throw new FatalError(`No contract for ${sut.id}; run learnAndStore first.`);

  const report = await runContractStep(sut, contract, golden);
  if (report.allPassed) {
    await pushToUiPathStep(sut, report);
    return { status: "passed" as const };
  }

  // Run the known-good model as baseline for the drift classifier.
  const baseline = await runContractStep(
    { id: sut.id, modelLabel: "good" },
    contract,
    golden,
  );
  const verdict = await classifyDriftStep(report, baseline);

  if (verdict.kind === "flaky") {
    await pushToUiPathStep(sut, report, { verdict });
    return { status: "flaky" as const };
  }

  // Real-regression or legitimate-evolution → require a human decision.
  const hook = createHook<ApprovalDecision>({
    token: `approve:${sut.id}:${change.changeId}`,
  });
  await notifyReviewerStep(sut, verdict);
  const choice = await hook; // ⏸ suspends until resumeHook

  if (
    choice.approved &&
    verdict.kind === "legitimate-evolution" &&
    verdict.proposedContractPatch
  ) {
    await versionContractStep(sut.id, verdict.proposedContractPatch);
  }

  await pushToUiPathStep(sut, report, { verdict, choice });
  return {
    status: verdict.kind as "real-regression" | "legitimate-evolution",
    approved: choice.approved,
  };
}
