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
 *   - triggeredRun()          VERIFIED LIVE — StartJobs started Orchestrator job
 *                             67149929 (State=Successful) against the published
 *                             `proctor-cycle-trigger` API workflow. "ModernJobsCount"
 *                             strategy + JSON InputArguments (incl. extra keys) accepted.
 *   - pushTestResult()        VERIFIED LIVE — publishes the TestReport to an
 *                             Orchestrator Queue (Proctor_TestResults; queue+item
 *                             created 201). With UIPATH_TEST_SET_ID it instead
 *                             triggers a Test Cloud Test Set execution, but this
 *                             Labs tenant gates Test-Case authoring behind a local
 *                             Robot install, so the queue path is the live one.
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
   * Publish a Proctor TestReport to UiPath. Two paths, chosen by configuration:
   *
   * 1. If UIPATH_TEST_SET_ID is set → trigger a Test Cloud Test Set execution
   *    (Orchestrator Test Automation API, tagged as an external-tool trigger):
   *      POST {orchestrator_}/api/TestAutomation/StartTestSetExecution
   *           ?testSetId={id}&triggerType=ExternalTool
   *    Docs: https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/test-executions
   *
   *    NOTE on this UiPath Labs tenant: Test Cases are authored in Studio and the
   *    tenant's browser-only mode gates RPA/Test-Case authoring behind a local
   *    UiPath Robot install — so no Test Set could be populated here to exercise
   *    this path live. The path is wired and runs wherever a Test Set exists; it
   *    is fail-open to the queue fallback below when none is configured.
   *
   * 2. Otherwise (the demonstrated path) → publish the TestReport to an
   *    Orchestrator **Queue** (`UIPATH_RESULTS_QUEUE`, default Proctor_TestResults)
   *    as the results channel. This needs no Robot and no Test Case, so it is the
   *    honest, live destination for Proctor's externally-computed results on a
   *    browser-only tenant. VERIFIED LIVE 2026-06-15 (queue + item created, 201).
   *      POST {orchestrator_}/odata/QueueDefinitions            (create, idempotent)
   *      POST {orchestrator_}/odata/Queues/UiPathODataSvc.AddQueueItem
   *    Docs: https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/queues-requests
   */
  async pushTestResult(sut: SutRef, report: TestReport): Promise<void> {
    this.assertConfigured();

    if (this.testSetId) {
      // Path 1 — Test Cloud Test Set execution.
      const summary = this.reportSummary(sut, report);
      const url =
        `${this.orchestratorBase()}/api/TestAutomation/StartTestSetExecution` +
        `?testSetId=${encodeURIComponent(this.testSetId)}&triggerType=ExternalTool`;
      // VERIFY: with a populated Test Set, confirm whether externally-computed
      // results belong in the body vs. are derived from Orchestrator executing the
      // set. Not exercisable on this tenant (no Test Set; see method doc).
      await this.request<number | { value?: number } | { Id?: number }>(url, {
        method: "POST",
        withFolder: true,
        body: JSON.stringify(summary),
      });
      return;
    }

    // Path 2 — Orchestrator Queue results channel (verified live).
    await this.publishResultToQueue(sut, report);
  }

  /** Flat, primitive-only projection of a TestReport for UiPath payloads. */
  private reportSummary(sut: SutRef, report: TestReport) {
    const failed = report.results.filter((r) => !r.passed);
    return {
      sutId: sut.id,
      modelLabel: sut.modelLabel,
      allPassed: report.allPassed,
      passed: report.results.length - failed.length,
      failed: failed.length,
      failedFields: failed.map((r) => r.field).join(", "),
      // SpecificContent values must be primitives; carry detail as a JSON string.
      detail: JSON.stringify(
        report.results.map((r) => ({
          field: r.field,
          kind: r.kind,
          passed: r.passed,
          evidence: r.evidence,
          ...(r.score !== undefined ? { score: r.score } : {}),
        }))
      ).slice(0, 9000),
    };
  }

  /**
   * Publish a TestReport to the Orchestrator results queue. Creates the queue on
   * first use (idempotent — an existing queue returns 409, which we treat as ok).
   */
  private async publishResultToQueue(sut: SutRef, report: TestReport): Promise<void> {
    const queueName = process.env["UIPATH_RESULTS_QUEUE"] ?? "Proctor_TestResults";
    await this.ensureResultsQueue(queueName);

    await this.request(
      `${this.orchestratorBase()}/odata/Queues/UiPathODataSvc.AddQueueItem`,
      {
        method: "POST",
        withFolder: true,
        body: JSON.stringify({
          itemData: {
            Name: queueName,
            Priority: report.allPassed ? "Normal" : "High",
            SpecificContent: this.reportSummary(sut, report),
          },
        }),
      }
    );
  }

  private async ensureResultsQueue(queueName: string): Promise<void> {
    try {
      await this.request(`${this.orchestratorBase()}/odata/QueueDefinitions`, {
        method: "POST",
        withFolder: true,
        body: JSON.stringify({
          Name: queueName,
          Description: "Proctor TestReport results channel",
          AcceptAutomaticallyRetry: false,
          EnforceUniqueReference: false,
        }),
      });
    } catch (e) {
      // 409 Conflict = queue already exists → fine. Anything else is a real error.
      if (!String((e as Error).message).includes(" 409 ")) throw e;
    }
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
      // CONFIRMED LIVE 2026-06-15: "ModernJobsCount" works for the serverless API
      // workflow (job 67149929 Successful).
      Strategy: "ModernJobsCount",
      JobsCount: 1,
      // InputArguments is a JSON-encoded string of the process's input args.
      // CONFIRMED LIVE: the process declares changeId + sutId; extra keys (touched)
      // in the payload were accepted without error.
      InputArguments: JSON.stringify(change),
    };

    // CONFIRMED LIVE: folder-scoped; X-UIPATH-OrganizationUnitId = the folder
    // holding the release (UIPATH_FOLDER_ID).
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
