/**
 * bootstrap.ts — one-shot workflow to learn and persist a contract for a SUT.
 */

import type { SutRef } from "@proctor/shared";
import {
  loadGoldenInputsStep,
  learnContractStep,
  saveContractStep,
} from "./steps.js";

export async function learnAndStore(sut: SutRef) {
  "use workflow";
  const golden = await loadGoldenInputsStep();
  const contract = await learnContractStep(sut, golden);
  await saveContractStep(contract);
  return contract;
}
