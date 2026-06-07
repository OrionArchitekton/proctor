/**
 * steps.ts — durable step functions for the Proctor workflow layer.
 *
 * Each async function has "use step" as its first line, marking it as a
 * durable step. Without the Workflow DevKit compiler, "use step" is a no-op,
 * so all steps are directly unit-testable as plain async functions.
 *
 * Steps take/return only serializable data.
 * All real I/O and LLM calls live here (or in deps.ts), never in the engine.
 */

import type { SutRef, Contract, TestReport, DriftVerdict, ContractPatch, ChangeContext } from "@proctor/shared";
import {
  runContract,
  classifyDrift,
  learnContract,
  ContractStore,
  scoreRisk,
  orderByRisk,
} from "@proctor/engine";
import { getGateway } from "@proctor/uipath";
import { loadFixtures, type InvoiceInput } from "@proctor/sut-invoice";
import { runSut, judge, reason, propose } from "./deps.js";

function getStore(): ContractStore {
  const baseDir = process.env["PROCTOR_DATA_DIR"] ?? (process.cwd() + "/contracts");
  return new ContractStore(baseDir);
}

// ── steps ──────────────────────────────────────────────────────────────────

/**
 * Run the contract test suite against real SUT outputs.
 */
export async function runContractStep(
  sut: SutRef,
  contract: Contract,
  goldenInputs: unknown[],
): Promise<TestReport> {
  "use step";
  return runContract(sut, contract, goldenInputs, { runSut, judge });
}

/**
 * Classify drift between a new report and a passing baseline.
 */
export async function classifyDriftStep(
  report: TestReport,
  baseline: TestReport,
): Promise<DriftVerdict> {
  "use step";
  return classifyDrift(report, baseline, { reason });
}

/**
 * Learn a new Contract by running the SUT and proposing field assertions.
 */
export async function learnContractStep(
  sut: SutRef,
  goldenInputs: unknown[],
): Promise<Contract> {
  "use step";
  return learnContract(sut, goldenInputs, { runSut, propose });
}

/**
 * Persist a Contract to the store.
 */
export async function saveContractStep(contract: Contract): Promise<void> {
  "use step";
  const store = getStore();
  await store.save(contract);
}

/**
 * Load a Contract from the store by SUT id.
 * Returns null if no contract exists yet.
 */
export async function loadContractStep(sutId: string): Promise<Contract | null> {
  "use step";
  const store = getStore();
  return store.load(sutId);
}

/**
 * Apply a patch to an existing contract and persist the new version.
 */
export async function versionContractStep(
  sutId: string,
  patch: ContractPatch,
): Promise<Contract> {
  "use step";
  const store = getStore();
  return store.version(sutId, patch);
}

/**
 * Push test results to UiPath and record a governance event.
 */
export async function pushToUiPathStep(
  sut: SutRef,
  report: TestReport,
  extra?: unknown,
): Promise<void> {
  "use step";
  const gateway = getGateway();
  await gateway.pushTestResult(sut, report);
  await gateway.recordGovernanceEvent({
    ts: new Date().toISOString(),
    sutId: sut.id,
    type: "cycle_result",
    payload: { allPassed: report.allPassed, extra },
  });
}

/**
 * Open an approval task in UiPath Action Center for a drift verdict.
 * Returns the task ID string.
 */
export async function notifyReviewerStep(
  sut: SutRef,
  verdict: DriftVerdict,
): Promise<string> {
  "use step";
  const gateway = getGateway();
  return gateway.openApprovalTask(sut, verdict);
}

/**
 * Load the golden invoice fixtures.
 */
export async function loadGoldenInputsStep(): Promise<InvoiceInput[]> {
  "use step";
  return loadFixtures();
}

/**
 * Load contracts, score risk, and return ordered SUT IDs (highest risk first).
 * MVP: uses the single known SUT from change.sutId with recentFailures=0.
 */
export async function loadContractsAndOrderStep(
  change: ChangeContext,
): Promise<string[]> {
  "use step";
  const store = getStore();
  const contract = await store.load(change.sutId);
  if (contract === null) {
    // No contract known yet — return the SUT id unordered.
    return [change.sutId];
  }
  const riskScore = scoreRisk(change.sutId, { recentFailures: 0 }, change);
  return orderByRisk([riskScore]);
}
