/**
 * seed-demo.ts — one-command keyless Proctor demo
 *
 * Narrates the full Proctor logic deterministically without needing the
 * workflow runtime. Step functions from @proctor/workflows are plain async
 * functions here ("use step" is a no-op outside the DevKit compiler).
 *
 * Run with: pnpm demo
 * Requirements: none — keyless via PROCTOR_FAKE_LLM=1 + PROCTOR_GATEWAY=local
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

// ── env defaults (must be set before any package imports) ─────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env["PROCTOR_FAKE_LLM"] ||= "1";
process.env["PROCTOR_GATEWAY"] ||= "local";
process.env["PROCTOR_DATA_DIR"] ||= path.join(__dirname, "..", ".proctor-demo");

// ── imports (after env is set) ─────────────────────────────────────────────
import { loadFixtures } from "@proctor/sut-invoice";
import {
  learnContractStep,
  runContractStep,
  classifyDriftStep,
  notifyReviewerStep,
} from "@proctor/workflows";
import { classifyDrift } from "@proctor/engine";
import type { SutRef, TestReport, DriftVerdict } from "@proctor/shared";

// ── helpers ────────────────────────────────────────────────────────────────

function hr(char = "─", len = 60): string {
  return char.repeat(len);
}

function heading(text: string): void {
  console.log();
  console.log(hr("═"));
  console.log(`  ${text}`);
  console.log(hr("═"));
}

function step(n: number, text: string): void {
  console.log();
  console.log(`${hr("─", 4)} Step ${n}: ${text} ${hr("─", Math.max(0, 48 - text.length))}`);
}

// ── demo ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  heading("Proctor — Keyless Demo  (PROCTOR_FAKE_LLM=1 / PROCTOR_GATEWAY=local)");

  console.log(
    "\nProctor regression-tests non-deterministic AI automations.\n" +
    "It learns a behavioral contract, catches silent regressions,\n" +
    "and escalates real failures to a human approval step.\n"
  );

  // ── 1. Learn contract ──────────────────────────────────────────────────
  step(1, "Learning behavioral contract for the invoice agent…");
  const fixtures = loadFixtures();
  console.log(`  Loaded ${fixtures.length} golden invoice fixtures.`);

  const sutGood: SutRef = { id: "invoice", modelLabel: "good" };
  const contract = await learnContractStep(sutGood, fixtures);

  console.log(`\n  Contract learned for SUT: ${contract.sutId}  (v${contract.version})`);
  console.log(`  Fields (${contract.fields.length}):`);
  for (const f of contract.fields) {
    const tol = f.tolerance != null ? `  tolerance=${f.tolerance}` : "";
    console.log(`    • ${f.name.padEnd(14)} [${f.kind}]${tol}`);
  }
  console.log(`  Invariants (${contract.invariants.length}):`);
  for (const inv of contract.invariants) {
    console.log(`    • ${inv}`);
  }

  // ── 2. Run GOOD model ──────────────────────────────────────────────────
  step(2, "Running GOOD model…");
  const goodReport: TestReport = await runContractStep(sutGood, contract, fixtures);

  const goodPass = goodReport.results.filter((r) => r.passed).length;
  const goodTotal = goodReport.results.length;
  const goodMark = goodReport.allPassed ? "✓" : "✗";
  console.log(
    `\n  allPassed: ${goodReport.allPassed} ${goodMark}   (${goodPass}/${goodTotal} assertions)`
  );

  // ── 3. Inject regression: DEGRADED model ──────────────────────────────
  step(3, "Injecting regression: swapping to DEGRADED model…");
  const sutDegraded: SutRef = { id: "invoice", modelLabel: "degraded" };
  const degradedReport: TestReport = await runContractStep(sutDegraded, contract, fixtures);

  const failedResults = degradedReport.results.filter((r) => !r.passed);
  const degradedMark = degradedReport.allPassed ? "✓" : "✗";
  console.log(
    `\n  allPassed: ${degradedReport.allPassed} ${degradedMark}   ` +
    `(${degradedReport.results.filter((r) => r.passed).length}/${degradedReport.results.length} assertions)`
  );
  if (failedResults.length > 0) {
    console.log(`\n  Failed assertions:`);
    for (const r of failedResults) {
      console.log(`    ✗ ${r.field.padEnd(30)} [${r.kind}]  ${r.evidence.slice(0, 80)}`);
    }
  }

  // ── 4. Classify drift ─────────────────────────────────────────────────
  step(4, "Classifying drift…");
  const verdict: DriftVerdict = await classifyDriftStep(degradedReport, goodReport);

  const verdictMark = verdict.kind === "real-regression" ? "🔴" : verdict.kind === "flaky" ? "🟡" : "🟢";
  console.log(`\n  Verdict: ${verdictMark}  ${verdict.kind}`);
  console.log(`  Rationale: ${verdict.rationale}`);
  if (verdict.proposedContractPatch) {
    console.log(`  Proposed patch: ${JSON.stringify(verdict.proposedContractPatch)}`);
  }

  // ── 4b. Legitimate-evolution illustration ─────────────────────────────
  console.log(
    `\n  [Aside] Classifier also handles legitimate evolution — when output changes\n` +
    `  but remains correct (e.g., vendor name formatting changed). In that case:\n` +
    `    verdict.kind === "legitimate-evolution"\n` +
    `    verdict.proposedContractPatch → { note, fields[] }  (widen tolerances)\n` +
    `  The workflow ALSO pauses for approval, then auto-versions the contract.\n`
  );

  // Demonstrate by calling classifyDrift directly with a semantic-only report
  // so rule 3 (all semantic, within tolerance) → delegates to reason → "legitimate-evolution"
  const evolutionReport: TestReport = {
    sutId: "invoice",
    allPassed: false,
    rawOutputs: [],
    results: [
      {
        field: "vendor",
        kind: "semantic",
        passed: false,
        evidence: "score 0.78 < threshold 0.80",
        score: 0.78,
      },
    ],
  };
  const evolutionVerdict = await classifyDrift(evolutionReport, goodReport, {
    reason: async (_r, _b) => ({
      kind: "legitimate-evolution",
      rationale: "non-exact drift — vendor formatting changed but still correct",
      proposedContractPatch: { note: "widen vendor semantic tolerance", fields: [] },
    }),
  });
  console.log(`  Illustration result: 🟢  ${evolutionVerdict.kind} — "${evolutionVerdict.rationale}"`);

  // ── 5. Open human approval task ───────────────────────────────────────
  step(5, "Opening human approval task (UiPath Action Center / governance)…");
  const taskId = await notifyReviewerStep(sutDegraded, verdict);
  const changeId = "demo";
  const approvalToken = `approve:${sutDegraded.id}:${changeId}`;

  console.log(`\n  Task ID:        ${taskId}`);
  console.log(`  Approval token: ${approvalToken}`);
  console.log(
    `\n  In the live app, the UiPath Action Center task is created here.\n` +
    `  The durable workflow SUSPENDS on this token and waits for a reviewer.\n`
  );

  // ── 6. Closing ─────────────────────────────────────────────────────────
  heading("Demo complete");
  console.log(
    "\n  In the live app, the durable workflow SUSPENDS here until a human\n" +
    "  approves — and survives restarts. Run `pnpm dev` to see it.\n" +
    "\n  The workflow resumes when a reviewer POSTs to /api/approve with the token:\n" +
    `    approve:invoice:demo\n` +
    "\n  That triggers the heal loop: regression → file finding; evolution → patch contract.\n" +
    "\n  UiPath Test Cloud receives the TestReport; Action Center shows the approval\n" +
    "  task; Orchestrator/Maestro can trigger new runs on model/prompt changes.\n"
  );
  console.log(hr("═"));
  console.log();
}

main().catch((err: unknown) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
