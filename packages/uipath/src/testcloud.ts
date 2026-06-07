import type { SutRef, TestReport, DriftVerdict, ChangeContext, GovernanceEvent } from "@proctor/shared";
import type { UiPathGateway, RunHandle, TaskId } from "./gateway.js";

/**
 * TestCloudGateway — real REST stubs for UiPath Test Cloud + Orchestrator.
 *
 * Requires env vars:
 *   UIPATH_BASE_URL  — e.g. https://cloud.uipath.com
 *   UIPATH_TENANT    — UiPath tenant name
 *   UIPATH_PAT       — Personal Access Token (UiPath Labs credentials)
 *
 * Until credentials are provisioned, set PROCTOR_GATEWAY=local (the default)
 * to run the full system without UiPath.
 */
export class TestCloudGateway implements UiPathGateway {
  private readonly baseUrl: string | undefined;
  private readonly tenant: string | undefined;
  private readonly pat: string | undefined;

  constructor() {
    this.baseUrl = process.env["UIPATH_BASE_URL"];
    this.tenant = process.env["UIPATH_TENANT"];
    this.pat = process.env["UIPATH_PAT"];
  }

  private assertConfigured(): void {
    if (!this.baseUrl || !this.tenant || !this.pat) {
      throw new Error(
        "TestCloudGateway requires UIPATH_BASE_URL, UIPATH_TENANT, UIPATH_PAT — " +
          "UiPath Labs credentials pending. Set PROCTOR_GATEWAY=local to run without UiPath."
      );
    }
  }

  /**
   * Push test results to UiPath Test Cloud.
   * POST {baseUrl}/{tenant}/testautomation_/api/v2/results
   * TODO: construct full result body per Test Cloud API spec.
   */
  async pushTestResult(sut: SutRef, report: TestReport): Promise<void> {
    this.assertConfigured();
    const url = `${this.baseUrl}/${this.tenant}/testautomation_/api/v2/results`;
    // TODO: map SutRef + TestReport to Test Cloud result body
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sutId: sut.id, allPassed: report.allPassed }),
    });
    if (!res.ok) {
      throw new Error(
        `Test Cloud pushTestResult failed: ${res.status} ${res.statusText}`,
      );
    }
  }

  /**
   * Open an Action Center approval task for a drift verdict.
   * POST {baseUrl}/{tenant}/orchestrator_/odata/Tasks
   * TODO: map DriftVerdict to Action Center task body.
   * Returns the task ID from the API response.
   */
  async openApprovalTask(sut: SutRef, verdict: DriftVerdict): Promise<TaskId> {
    this.assertConfigured();
    const url = `${this.baseUrl}/${this.tenant}/orchestrator_/odata/Tasks`;
    // TODO: map sut + verdict to Action Center task body per Orchestrator API spec
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sutId: sut.id, verdict }),
    });
    if (!res.ok) {
      throw new Error(
        `Action Center openApprovalTask failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as { Id?: string; value?: { Id: string }[] };
    const taskId = body.Id ?? body.value?.[0]?.Id;
    if (!taskId) {
      throw new Error(
        "Action Center openApprovalTask returned no task ID — refusing to fabricate one",
      );
    }
    return taskId;
  }

  /**
   * Inbound UiPath→Proctor trigger edge — represents an Orchestrator start-job call.
   * POST {baseUrl}/{tenant}/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs
   * TODO: configure process/release keys for the Proctor orchestration process.
   * Only exercised end-to-end under TestCloud.
   */
  async triggeredRun(change: ChangeContext): Promise<RunHandle> {
    this.assertConfigured();
    const url =
      `${this.baseUrl}/${this.tenant}/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;
    // TODO: map ChangeContext to Orchestrator start-job body (ReleaseKey, InputArguments, etc.)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ changeId: change.changeId, sutId: change.sutId }),
    });
    if (!res.ok) {
      throw new Error(
        `Orchestrator triggeredRun failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as { value?: { Id: number }[] };
    const jobId = body.value?.[0]?.Id ?? change.changeId;
    return { runId: String(jobId) };
  }

  /**
   * Record a governance event to the UiPath audit trail.
   * TODO: determine the appropriate UiPath audit/logging endpoint.
   */
  async recordGovernanceEvent(evt: GovernanceEvent): Promise<void> {
    this.assertConfigured();
    // TODO: POST to appropriate UiPath audit endpoint
    // For now, no-op beyond asserting configuration — avoids swallowing events silently.
    void evt;
  }
}
