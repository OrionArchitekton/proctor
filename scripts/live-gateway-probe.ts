/**
 * live-gateway-probe.ts — exercises the REAL TestCloudGateway against the live
 * UiPath tenant to verify request/response shapes (the `// VERIFY:` items).
 *
 * Run:  doppler run -p uipath-hack -c prd -- env PROCTOR_GATEWAY=testcloud npx tsx scripts/live-gateway-probe.ts
 *
 * NOTE: openApprovalTask creates a REAL Action Center task (intended — it's the
 * live demo artifact). The other calls are attempted and any error is reported,
 * not thrown, so one missing resource (release key / test set) doesn't abort the
 * whole probe.
 */
import { TestCloudGateway } from "../packages/uipath/src/testcloud.ts";
import type { SutRef, DriftVerdict, TestReport, ChangeContext, GovernanceEvent } from "../packages/shared/src/index.ts";

const gw = new TestCloudGateway();
const sut: SutRef = { id: "invoice", modelLabel: "degraded" };
const verdict: DriftVerdict = {
  kind: "real-regression",
  rationale: "live tenant probe — invariant violated: sum_line_items_eq_total",
};

async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    console.log(`PASS  [${label}]  →`, JSON.stringify(out));
    return { ok: true, out };
  } catch (e) {
    console.log(`FAIL  [${label}]  →`, (e as Error).message.slice(0, 600));
    return { ok: false, err: e };
  }
}

const main = async () => {
  console.log("=== Live TestCloudGateway probe ===");
  console.log("gateway:", process.env["PROCTOR_GATEWAY"], "org:", process.env["UIPATH_ORG"], "tenant:", process.env["UIPATH_TENANT"]);
  console.log();

  // 1) Action Center — creates a REAL approval task (the money-shot surface)
  const task = await attempt("openApprovalTask (Action Center)", () => gw.openApprovalTask(sut, verdict));

  // 2) Governance event — warn-only by design
  await attempt("recordGovernanceEvent", () => {
    const evt: GovernanceEvent = { ts: "2026-06-15T00:00:00Z", sutId: sut.id, type: "live_probe", payload: {} };
    return gw.recordGovernanceEvent(evt);
  });

  // 3) triggeredRun — needs UIPATH_PROCTOR_RELEASE_KEY (expected to fail if unset)
  const change: ChangeContext = { changeId: "live-probe", sutId: sut.id, touched: ["model"] };
  await attempt("triggeredRun (StartJobs)", () => gw.triggeredRun(change));

  // 4) pushTestResult — Test Set path if UIPATH_TEST_SET_ID set, else Orchestrator queue
  const report: TestReport = {
    sutId: sut.id,
    allPassed: false,
    results: [
      { field: "sum_line_items_eq_total", kind: "exact", passed: false, evidence: "sum=150 total=100" },
      { field: "vendor", kind: "structural", passed: true, evidence: "present" },
    ],
    rawOutputs: [],
  };
  await attempt("pushTestResult (Test Cloud / Orchestrator queue)", () => gw.pushTestResult(sut, report));

  console.log();
  console.log("=== probe done ===");
  if (task.ok) console.log("Action Center task id:", JSON.stringify(task.out));
};

main().catch((e) => {
  console.error("probe crashed:", e);
  process.exit(1);
});
