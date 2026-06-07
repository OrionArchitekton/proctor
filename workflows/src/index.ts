/**
 * index.ts — barrel export for the @proctor/workflows package.
 */

export {
  runContractStep,
  classifyDriftStep,
  learnContractStep,
  saveContractStep,
  loadContractStep,
  versionContractStep,
  pushToUiPathStep,
  notifyReviewerStep,
  loadGoldenInputsStep,
  loadContractsAndOrderStep,
} from "./steps.js";

export { runSut, judge, reason, propose } from "./deps.js";

export { proctorCycle } from "./proctorCycle.js";
export { learnAndStore } from "./bootstrap.js";
export { proctorRun } from "./proctorRun.js";
