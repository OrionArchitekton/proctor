# Proctor — Architecture

## Overview

Proctor operates at two altitudes. **UiPath** is the enterprise control plane: it governs when tests run, who approves findings, and holds the audit record. **Vercel Workflow** is the agent's durable brain: it gives the QA heal-loop the ability to survive interruptions and wait days for a human decision without losing state. The two planes communicate only through the `UiPathGateway` adapter — nothing in Proctor's core knows whether it is talking to a local log file or to UiPath Test Cloud REST APIs.

---

## Components

### `@proctor/shared`
Pure TypeScript types and Zod schemas. No logic. Consumed by every package.

Key types: `Contract`, `SutRef`, `TestReport`, `AssertionResult`, `DriftVerdict`, `GovernanceEvent`, `ChangeContext`.

### `@proctor/engine` (pure core)
No I/O. No LLM calls. No side effects. Fully unit-testable in isolation.

| Module | Responsibility |
|--------|---------------|
| `learner.ts` | `learnContract(sut, inputs, deps)` — observes field distributions across baseline runs, delegates assertion-kind decisions to `deps.propose` |
| `runner.ts` | `runContract(sut, contract, inputs, deps)` — evaluates each SUT output against the contract; three assertion kinds |
| `assertions.ts` | `assertPresent`, `assertExact`, `assertSemantic` — the three assertion primitives |
| `invariants.ts` | Domain invariants (`sum_line_items_eq_total`, `currency_consistent`, `vendor_nonempty`, `dates_parseable`); invariant failures are deterministic — the LLM classifier cannot override them |
| `classifier.ts` | `classifyDrift(report, baseline, deps)` — rule-based fast paths first (no failures → flaky; invariant violated → real-regression; all semantic + borderline → flaky); delegates to `deps.reason` only when no rule fires |
| `risk.ts` | `scoreRisk`, `orderByRisk` — risk-based test ordering (failure history × change impact) |
| `store.ts` | `ContractStore` — filesystem-backed contract persistence (JSON, versioned) |

**Engine purity boundary:** The engine never calls external services. All I/O dependencies are injected through typed `deps` interfaces (`RunDeps`, `LearnDeps`, `ClassifyDeps`). This makes every engine function independently unit-testable and replay-safe inside the durable workflow.

### `@proctor/sut-invoice`
The system under test: a non-deterministic invoice-extraction agent. Accepts a `modelLabel` of `"good"` (correct totals) or `"degraded"` (mis-extracts totals) to demonstrate regressions on demand. Five JSON fixture invoices in `fixtures/`.

### `@proctor/uipath`
The gateway seam.

```
UiPathGateway (interface)
├── LocalGateway   — writes governance.log.jsonl; used by default + tests
└── TestCloudGateway — REST stubs for Test Cloud + Orchestrator APIs
```

`getGateway()` reads `PROCTOR_GATEWAY` from env. No other package references the implementations directly.

### `@proctor/workflows` (step layer)
Durable step functions. Each function starts with `"use step"` — a no-op in plain Node/tsx but compiled to a durable checkpoint by the Vercel Workflow DevKit. Steps are the only place where real I/O occurs: LLM calls, UiPath API calls, contract reads/writes.

`deps.ts` holds the dependency implementations: `runSut` (invoice agent adapter), `judge` (semantic similarity — bigram Jaccard in fake mode, embedding/LLM in real mode), `reason` (drift LLM), `propose` (field assertion proposer). All honour `PROCTOR_FAKE_LLM=1` for a deterministic keyless path.

### `apps/web`
Next.js 15 dashboard. Polling state endpoint for live feed. Routes:
- `GET /api/state` — returns governance events + contract from `LocalGateway`
- `POST /api/bootstrap` — triggers `learnAndStore`
- `POST /api/run` — triggers `proctorRun` (learn if no contract, then run + classify)
- `POST /api/approve` — resumes the durable workflow on `approve:{sutId}:{changeId}` hook token

---

## Data Flow — One Proctor Cycle

```
1. Trigger arrives (UiPath Orchestrator → /api/run, or manual via dashboard)
2. loadContractsAndOrderStep — risk-score → highest-risk SUT first
3. runContractStep(sut, contract, fixtures)
   └── runSut × fixtures → AssertionResult[] → TestReport
4. if allPassed:
   └── pushToUiPathStep → Test Cloud + governance log → DONE
5. classifyDriftStep(report, baseline)
   ├── Rule 1: no failures      → flaky → pushToUiPath → DONE
   ├── Rule 2: invariant failed → real-regression (deterministic, no LLM)
   ├── Rule 3: all semantic, borderline → flaky → pushToUiPath → DONE
   └── Rule 4: delegate to deps.reason (LLM)
6. verdict = real-regression | legitimate-evolution
7. notifyReviewerStep → gateway.openApprovalTask (Action Center task)
8. createHook(token) → workflow SUSPENDS ⏸
9. Human approves/rejects → POST /api/approve → resumeHook(token, decision)
10. On approve + legitimate-evolution → versionContractStep (patch contract)
11. pushToUiPathStep → Test Cloud result + governance event → DONE
```

---

## Durable Workflow Rationale

The QA cycle can span days: a regression surfaces, a human needs to review it, the reviewer is on leave. Without durability, the process either blocks a server thread or loses state on restart.

Vercel Workflow gives each cycle a durable execution context. `"use step"` marks checkpoints: on restart, the DevKit replays from the last persisted checkpoint — no re-running LLM calls, no re-executing SUT runs, no double-writing to UiPath. Each step is independently retried on failure. The `createHook` + token pattern suspends execution cleanly until `resumeHook` is called from the approval API route.

This is the same durability guarantee the judging criteria call out: "handle exceptions/failures" across a multi-day approval gap.

---

## Gateway Seam

```typescript
interface UiPathGateway {
  triggeredRun(change: ChangeContext): Promise<RunHandle>;
  pushTestResult(sut: SutRef, report: TestReport): Promise<void>;
  openApprovalTask(sut: SutRef, verdict: DriftVerdict): Promise<TaskId>;
  recordGovernanceEvent(evt: GovernanceEvent): Promise<void>;
}
```

`LocalGateway` writes to a JSONL file and serves events to the Next.js dashboard. `TestCloudGateway` holds the wired REST endpoints for UiPath Test Cloud and Action Center, with TODOs for final request-body mapping pending live credentials. Swapping gateways requires only setting `PROCTOR_GATEWAY=testcloud` and providing the three UiPath env vars — no code changes.

---

## Package Dependency Graph

```
apps/web
  ├── @proctor/workflows          (start/resumeHook: bootstrap, run, approve)
  │     ├── @proctor/engine       (pure)
  │     ├── @proctor/shared       (types)
  │     ├── @proctor/sut-invoice
  │     └── @proctor/uipath
  └── (read path) @proctor/engine ContractStore + @proctor/uipath LocalGateway
        — used directly by GET /api/state for read-only dashboard polling
```

The engine has no upward dependencies (it imports only `@proctor/shared`, plus `node:fs` in `store.ts`). The workflow layer is the only place that wires the engine to real I/O for **mutating** actions (bootstrap/run/approve all go through `start()`/`resumeHook`). The one exception is the **read-only** `GET /api/state` route, which reads the `ContractStore` and `LocalGateway` event log directly for dashboard polling — it performs no orchestration, so it deliberately bypasses the workflow layer.
