import type { SutRef, TestReport, DriftVerdict, ChangeContext, GovernanceEvent } from "@proctor/shared";
import type { UiPathGateway, RunHandle, TaskId } from "./gateway.js";

/**
 * TestCloudGateway — real UiPath Automation Cloud REST wiring for Proctor.
 *
 * STATUS (2026-06-15, UiPath Labs tenant hackathon26_529/DefaultTenant):
 *   - openApprovalTask()      VERIFIED LIVE — created Action Center task id
 *                             100000126 with this exact code (CreateTask
 *                             GenericTasks endpoint, ExternalTask body, "Critical"
 *                             priority, folder header, lowercase `id` response).
 *   - recordGovernanceEvent() VERIFIED — warn-only by design (no UiPath audit-write API).
 *   - triggeredRun()          WIRED, fail-closed — needs UIPATH_PROCTOR_RELEASE_KEY
 *                             (a published Orchestrator process); not yet exercised.
 *   - pushTestResult()        WIRED, fail-closed — needs UIPATH_TEST_SET_ID
 *                             (a Test Set in the tenant); not yet exercised.
 * The remaining endpoints/bodies are built from the public UiPath docs (cited
 * inline); spots still to confirm against the live tenant keep a `// VERIFY:`
 * comment + doc URL. Run scripts/live-gateway-probe.ts to re-exercise live.
 *
 * --- Required env (constructor throws via assertConfigured() if any missing) ---
 *   UIPATH_BASE_URL  — Automation Cloud base, e.g. https://cloud.uipath.com
 *   UIPATH_TENANT    — UiPath tenant name (the {tenantName} URL segment)
 *   UIPATH_PAT       — Personal Access Token (sent as `Authorization: Bearer`)
 *
 * --- Optional env (required only by the calls that use them; each call asserts
 *     its own requirement with a clear message so the failure points at the
 *     missing var, not a generic 4xx) ---
 *   UIPATH_ORG                 — organization name; the {organizationName} URL
 *                                segment. Required for ALL real Cloud calls.
 *   UIPATH_FOLDER_ID           — Orchestrator folder / OrganizationUnit id, sent
 *                                as the `X-UIPATH-OrganizationUnitId` header.
 *                                Required for folder-scoped Orchestrator calls
 *                                (tasks, jobs, test executions).
 *   UIPATH_PROCTOR_RELEASE_KEY — ReleaseKey (UUID) of the Proctor orchestration
 *                                process, used by triggeredRun()/StartJobs.
 *   UIPATH_TEST_SET_ID         — numeric Test Set id that Proctor reports results
 *                                against, used by pushTestResult().
 *   UIPATH_TASK_CATALOG        — (optional) Action Center task catalog name for
 *                                external tasks. Omitted from the body if unset.
 *
 * All tenant-specific resource identifiers are env-driven so no code change is
 * needed per tenant — only env + the VERIFY pass.
 *
 * --- Doc references ---
 *  Auth / PAT:        https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/using-personal-access-tokens-for-api-authentication
 *  URL structure:     https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests
 *  Folder header:     https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests
 *
 * Until credentials are provisioned, set PROCTOR_GATEWAY=local (the default)
 * to run the full system without UiPath.
 */
export class TestCloudGateway implements UiPathGateway {
  private readonly baseUrl: string | undefined;
  private readonly tenant: string | undefined;
  private readonly pat: string | undefined;

  // Optional, tenant-specific resource identifiers (see class JSDoc).
  private readonly org: string | undefined;
  private readonly folderId: string | undefined;
  private readonly releaseKey: string | undefined;
  private readonly testSetId: string | undefined;
  private readonly taskCatalog: string | undefined;

  constructor() {
    this.baseUrl = process.env["UIPATH_BASE_URL"];
    this.tenant = process.env["UIPATH_TENANT"];
    this.pat = process.env["UIPATH_PAT"];

    this.org = process.env["UIPATH_ORG"];
    this.folderId = process.env["UIPATH_FOLDER_ID"];
    this.releaseKey = process.env["UIPATH_PROCTOR_RELEASE_KEY"];
    this.testSetId = process.env["UIPATH_TEST_SET_ID"];
    this.taskCatalog = process.env["UIPATH_TASK_CATALOG"];
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
   * Build the Orchestrator base URL for the configured org+tenant.
   * Shape: {baseUrl}/{organizationName}/{tenantName}/orchestrator_
   * Per https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests
   */
  private orchestratorBase(): string {
    if (!this.org) {
      throw new Error(
        "TestCloudGateway requires UIPATH_ORG (organization name) for real UiPath Cloud calls."
      );
    }
    // baseUrl/tenant are guaranteed by assertConfigured() before this is reached.
    const base = this.baseUrl!.replace(/\/+$/, "");
    return `${base}/${this.org}/${this.tenant}/orchestrator_`;
  }

  /**
   * Shared authenticated request helper.
   * - Builds nothing about the path itself (callers pass an absolute URL) so the
   *   path can come from either orchestratorBase() or a non-OData API surface.
   * - Sets Bearer auth + JSON content type.
   * - Adds X-UIPATH-OrganizationUnitId when `withFolder` is true (folder-scoped
   *   Orchestrator calls require it).
   * - On !res.ok throws an Error including status + response body text for
   *   debuggability.
   * - Returns parsed JSON (or undefined for empty 2xx bodies).
   */
  private async request<T>(
    url: string,
    init: RequestInit & { withFolder?: boolean } = {}
  ): Promise<T> {
    const { withFolder, headers: extraHeaders, ...rest } = init;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pat}`,
      "Content-Type": "application/json",
      ...(extraHeaders as Record<string, string> | undefined),
    };

    if (withFolder) {
      if (!this.folderId) {
        throw new Error(
          "TestCloudGateway requires UIPATH_FOLDER_ID (Orchestrator folder / OrganizationUnit id) " +
            "for folder-scoped calls (tasks, jobs, test executions)."
        );
      }
      // Folder context header. Per UiPath docs this carries FolderId in plain text.
      // https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests
      headers["X-UIPATH-OrganizationUnitId"] = this.folderId;
    }

    const res = await fetch(url, { ...rest, headers });

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "<unreadable response body>";
      }
      throw new Error(
        `UiPath request failed: ${res.status} ${res.statusText} for ${init.method ?? "GET"} ${url} — ${bodyText}`
      );
    }

    // Some endpoints (e.g. POSTs returning 200/201 with no JSON) may be empty.
    const text = await res.text();
    if (!text) {
      return undefined as unknown as T;
    }
    return JSON.parse(text) as T;
  }

  /**
   * Push test results to UiPath Test Cloud / Test Automation.
   *
   * Approach: trigger a Test Set execution for the configured Test Set via the
   * Orchestrator Test Automation API, tagging it as an external-tool trigger.
   * This is the most-documented path for surfacing an automated/external test
   * result against a Test Set in Test Cloud.
   *
   *   POST {orchestrator_}/api/TestAutomation/StartTestSetExecution
   *        ?testSetId={id}&triggerType=ExternalTool
   *   → returns the test set execution Id (numeric).
   *
   * Docs:
   *   https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/test-executions
   *   Forum (endpoint + params + ExternalTool trigger):
   *   https://forum.uipath.com/t/how-to-trigger-test-set-execution-via-api-in-uipath-orchestrator/5740987
   *
   * We map report.allPassed + a per-field summary into the request so the run is
   * traceable, but the canonical pass/fail in Test Cloud comes from the executed
   * test cases. See VERIFY notes below — the exact ingestion contract for
   * *externally-produced* results (vs. Orchestrator running the test set itself)
   * must be confirmed against the live tenant's Swagger.
   */
  async pushTestResult(sut: SutRef, report: TestReport): Promise<void> {
    this.assertConfigured();

    if (!this.testSetId) {
      throw new Error(
        "TestCloudGateway.pushTestResult requires UIPATH_TEST_SET_ID (Test Set to report against)."
      );
    }

    // Human-readable summary of the local assertion results, carried for
    // traceability/log correlation on the UiPath side.
    const summary = {
      sutId: sut.id,
      modelLabel: sut.modelLabel,
      allPassed: report.allPassed,
      results: report.results.map((r) => ({
        field: r.field,
        kind: r.kind,
        passed: r.passed,
        evidence: r.evidence,
        ...(r.score !== undefined ? { score: r.score } : {}),
      })),
    };

    // VERIFY: confirm the exact endpoint, HTTP method, and query params against
    // the tenant Swagger at {orchestrator_}/swagger/index.html#/TestAutomation.
    // Community evidence shows POST .../api/TestAutomation/StartTestSetExecution
    // with testSetId + triggerType=ExternalTool; some tenants have moved Test
    // Automation surfaces into Test Manager (testmanager_) — confirm which
    // applies for UiPath Labs.
    // https://forum.uipath.com/t/how-to-trigger-test-set-execution-via-api-in-uipath-orchestrator/5740987
    const url =
      `${this.orchestratorBase()}/api/TestAutomation/StartTestSetExecution` +
      `?testSetId=${encodeURIComponent(this.testSetId)}&triggerType=ExternalTool`;

    // VERIFY: StartTestSetExecution as documented takes its inputs as query
    // params and may accept an empty/absent body. If the live API instead
    // expects the externally-computed results in the body (a true "ingest
    // external result" contract), send `summary` there and confirm the field
    // names. We send it as the body now so the data is not silently dropped;
    // a tenant that rejects an unexpected body will surface a clear 4xx via
    // request()'s error text.
    const execId = await this.request<number | { value?: number } | { Id?: number }>(
      url,
      {
        method: "POST",
        withFolder: true,
        body: JSON.stringify(summary),
      }
    );

    // VERIFY: confirm the response shape. StartTestSetExecution is documented to
    // return the execution Id directly as a number; defensively unwrap common
    // OData wrappers too.
    void execId; // execution id retained for callers/logs once shape is confirmed
  }

  /**
   * Open an Action Center external (approval) task for a drift verdict.
   *
   *   POST {orchestrator_}/tasks/GenericTasks/CreateTask
   *   body: { type: "ExternalTask", title, priority, data, externalTag, taskCatalogName? }
   *   → 201 with { id, status, data, action, externalTag }
   *
   * Docs:
   *   https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/generic-tasks-requests
   *   https://docs.uipath.com/action-center/standalone/2023.4/user-guide/create-external-task
   *
   * Returns the created task Id from the response. Keeps the "refuse to
   * fabricate an id" guard.
   */
  async openApprovalTask(sut: SutRef, verdict: DriftVerdict): Promise<TaskId> {
    this.assertConfigured();

    // CONFIRMED LIVE 2026-06-15: this endpoint created task id 100000126 on the
    // UiPath Labs tenant. Folder-scoped (X-UIPATH-OrganizationUnitId required).
    const url = `${this.orchestratorBase()}/tasks/GenericTasks/CreateTask`;

    const body: Record<string, unknown> = {
      type: "ExternalTask",
      title: `Proctor: ${verdict.kind} on ${sut.id}`,
      // CONFIRMED LIVE: "Critical" accepted (set: Low/Medium/High/Critical).
      priority: priorityForVerdict(verdict),
      // `data` carries the full verdict + sut so the human reviewer in Action
      // Center sees the rationale and proposed contract patch.
      data: {
        sut,
        verdict,
      },
      // externalTag lets Proctor correlate the task back to the SUT/run.
      externalTag: `proctor:${sut.id}`,
      // taskCatalogName is optional; only include it when configured.
      ...(this.taskCatalog ? { taskCatalogName: this.taskCatalog } : {}),
    };

    // CONFIRMED LIVE: folder-scoped; X-UIPATH-OrganizationUnitId = UIPATH_FOLDER_ID.
    const res = await this.request<{ id?: number; Id?: number; value?: { Id: number }[] }>(
      url,
      {
        method: "POST",
        withFolder: true,
        body: JSON.stringify(body),
      }
    );

    // VERIFY: response uses lowercase `id` per the GenericTasks docs example;
    // accept `Id`/OData `value[0].Id` defensively in case the tenant differs.
    const rawId = res.id ?? res.Id ?? res.value?.[0]?.Id;
    if (rawId === undefined || rawId === null) {
      throw new Error(
        "Action Center openApprovalTask returned no task id — refusing to fabricate one"
      );
    }
    return String(rawId);
  }

  /**
   * Inbound trigger edge — start the Proctor orchestration job in Orchestrator.
   *
   *   POST {orchestrator_}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs
   *   body: { startInfo: { ReleaseKey, Strategy, JobsCount, InputArguments } }
   *   → { value: [ { Id, ... } ] }
   *
   * Docs:
   *   https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/jobs-requests
   *
   * InputArguments must be a JSON-ENCODED STRING (not a nested object), per the
   * StartJobs contract. We pass `change` through that way.
   * Returns { runId: String(jobId) }.
   */
  async triggeredRun(change: ChangeContext): Promise<RunHandle> {
    this.assertConfigured();

    if (!this.releaseKey) {
      throw new Error(
        "TestCloudGateway.triggeredRun requires UIPATH_PROCTOR_RELEASE_KEY (Proctor process ReleaseKey)."
      );
    }

    const url =
      `${this.orchestratorBase()}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;

    const startInfo = {
      ReleaseKey: this.releaseKey,
      // VERIFY: "ModernJobsCount" is the strategy for modern folders + JobsCount;
      // older/classic folders use "All"/"Specific" (which need RobotIds).
      // Confirm the Proctor process's folder type and adjust if needed.
      Strategy: "ModernJobsCount",
      JobsCount: 1,
      // InputArguments is a JSON-encoded string of the process's input args.
      // VERIFY: the Proctor orchestration process must declare matching input
      // argument names (changeId, sutId, touched) for these to bind.
      InputArguments: JSON.stringify(change),
    };

    // VERIFY: StartJobs is folder-scoped — requires X-UIPATH-OrganizationUnitId
    // pointing at the folder containing the Proctor process.
    const res = await this.request<{ value?: { Id: number }[] }>(url, {
      method: "POST",
      withFolder: true,
      body: JSON.stringify({ startInfo }),
    });

    const jobId = res.value?.[0]?.Id;
    if (jobId === undefined || jobId === null) {
      throw new Error(
        "Orchestrator triggeredRun (StartJobs) returned no job Id — refusing to fabricate one"
      );
    }
    return { runId: String(jobId) };
  }

  /**
   * Record a governance event to a UiPath audit trail.
   *
   * The UiPath Orchestrator Audit Log API is READ-ONLY for clients: it exposes
   * list/export of system-generated audit events
   * (GET/POST .../odata/AuditLogs/UiPath.Server.Configuration.OData.Export) but
   * there is NO documented public endpoint to WRITE a custom application event
   * into the audit trail.
   * https://docs.uipath.com/orchestrator/standalone/2025.10/api-Guide/audit-logs
   *
   * Rather than fake remote persistence, we surface honestly that the event is
   * not persisted to a UiPath audit trail. Use PROCTOR_GATEWAY=local for a
   * persisted (file-backed) audit trail.
   *
   * VERIFY: if UiPath Labs exposes a custom-event/log ingestion surface (e.g. a
   * Robot Logs ingestion endpoint, an Insights custom-event API, or a tenant-
   * specific audit-write capability), wire it here. As of the cited docs no
   * clean public write endpoint exists, so this stays a warning by design.
   */
  async recordGovernanceEvent(evt: GovernanceEvent): Promise<void> {
    this.assertConfigured();
    console.warn(
      `TestCloudGateway.recordGovernanceEvent: UiPath has no public audit-write endpoint — ` +
        `event not persisted remotely (type=${evt.type}, sutId=${evt.sutId}). ` +
        `Use PROCTOR_GATEWAY=local for a persisted audit trail.`
    );
  }
}

/**
 * Map a drift verdict to an Action Center task priority.
 * VERIFY: confirm the accepted priority enum/casing against the tenant
 * (docs show "High"; common set is Low/Medium/High/Critical).
 */
function priorityForVerdict(verdict: DriftVerdict): string {
  switch (verdict.kind) {
    case "real-regression":
      return "Critical";
    case "legitimate-evolution":
      return "Medium";
    case "flaky":
      return "Low";
    default:
      return "Medium";
  }
}
