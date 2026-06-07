import type { SutRef, TestReport, DriftVerdict, ChangeContext, GovernanceEvent } from "@proctor/shared";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { UiPathGateway, RunHandle, TaskId } from "./gateway.js";

const LOG_FILE = "governance.log.jsonl";

export class LocalGateway implements UiPathGateway {
  private readonly logPath: string;

  constructor(private readonly baseDir: string) {
    this.logPath = join(baseDir, LOG_FILE);
  }

  async recordGovernanceEvent(evt: GovernanceEvent): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await appendFile(this.logPath, JSON.stringify(evt) + "\n", "utf8");
  }

  async pushTestResult(sut: SutRef, report: TestReport): Promise<void> {
    await this.recordGovernanceEvent({
      ts: new Date().toISOString(),
      sutId: sut.id,
      type: "test_result",
      payload: { allPassed: report.allPassed, results: report.results },
    });
  }

  async openApprovalTask(sut: SutRef, verdict: DriftVerdict): Promise<TaskId> {
    // Count existing approval_task_opened events to produce a deterministic, monotonic ID.
    const existing = await this.recentEvents();
    const count = existing.filter((e) => e.type === "approval_task_opened" && e.sutId === sut.id).length;
    await this.recordGovernanceEvent({
      ts: new Date().toISOString(),
      sutId: sut.id,
      type: "approval_task_opened",
      payload: verdict,
    });
    return `task-${sut.id}-${count}`;
  }

  /**
   * Represents the inbound UiPath→Proctor trigger edge.
   * In local mode, records a triggered_run governance event and returns a deterministic run ID.
   * Only exercised end-to-end under TestCloud.
   */
  async triggeredRun(change: ChangeContext): Promise<RunHandle> {
    await this.recordGovernanceEvent({
      ts: new Date().toISOString(),
      sutId: change.sutId,
      type: "triggered_run",
      payload: { changeId: change.changeId, touched: change.touched },
    });
    return { runId: `local-run-${change.changeId}` };
  }

  /**
   * Read the JSONL audit log and return the last `limit` events.
   * Returns an empty array if the log file does not exist yet.
   */
  async recentEvents(limit = 100): Promise<GovernanceEvent[]> {
    let raw: string;
    try {
      raw = await readFile(this.logPath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const events = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as GovernanceEvent);
    return events.slice(-limit);
  }
}
