import type { SutRef, TestReport, DriftVerdict, ChangeContext, GovernanceEvent } from "@proctor/shared";
import { LocalGateway } from "./local.js";
import { TestCloudGateway } from "./testcloud.js";

export interface RunHandle {
  runId: string;
}

export type TaskId = string;

export interface UiPathGateway {
  /**
   * Inbound UiPath→Proctor trigger edge.
   * Under LocalGateway this records a governance event and returns a local run ID.
   * Under TestCloudGateway this calls the Orchestrator start-job API.
   * Only exercised end-to-end under TestCloud.
   */
  triggeredRun(change: ChangeContext): Promise<RunHandle>;

  /** Push test results to UiPath Test Cloud (or log locally). */
  pushTestResult(sut: SutRef, report: TestReport): Promise<void>;

  /**
   * Open an Action Center approval task for a drift verdict.
   * Returns a taskId that can be referenced in subsequent calls.
   */
  openApprovalTask(sut: SutRef, verdict: DriftVerdict): Promise<TaskId>;

  /** Append an event to the audit trail. */
  recordGovernanceEvent(evt: GovernanceEvent): Promise<void>;
}

/**
 * Factory: read process.env.PROCTOR_GATEWAY to select the active implementation.
 *   "testcloud" → TestCloudGateway (requires UIPATH_BASE_URL, UIPATH_TENANT, UIPATH_PAT)
 *   anything else (including unset) → LocalGateway (default, no credentials required)
 *
 * Base directory for LocalGateway: process.env.PROCTOR_DATA_DIR ?? process.cwd() + "/contracts"
 */
export function getGateway(): UiPathGateway {
  const kind = process.env["PROCTOR_GATEWAY"] ?? "local";
  if (kind === "testcloud") {
    return new TestCloudGateway();
  }
  const baseDir = process.env["PROCTOR_DATA_DIR"] ?? (process.cwd() + "/contracts");
  return new LocalGateway(baseDir);
}
