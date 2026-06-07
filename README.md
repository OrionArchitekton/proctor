# Proctor — The Agent That QAs Other Agents

**UiPath AgentHack 2026 — Track 3: UiPath Test Cloud**

Proctor is a QA agent that regression-tests non-deterministic AI automations. It learns each automation's behavioral contract, catches when a model or prompt change silently breaks it, self-heals the tests when the change is legitimate, and escalates real regressions to a human — all governed by the UiPath Platform.

---

## What it does

AI automations are non-deterministic: the same input rarely produces byte-identical output. That makes naive regression testing (`output == expected`) unusable — it either flakes constantly or lets real regressions through.

Proctor solves this with a **behavioral contract + drift classification** approach:

1. **Learn** — run the automation over golden inputs, observe field distributions, propose assertion altitudes (structural/exact/semantic) per field, derive invariants. Result: a versioned `Contract`.
2. **Run** — re-execute the automation and evaluate each output against the contract. Structural assertions check presence; exact assertions check deterministic fields (totals, currencies); semantic assertions use similarity scoring for fuzzy text fields.
3. **Classify** — when assertions fail, Proctor classifies: `real-regression` (something broke), `legitimate-evolution` (output changed but is still correct → propose a contract patch), or `flaky` (within tolerance).
4. **Escalate** — real regressions and evolution both pause on a **human approval hook** before any mutation. The durable workflow survives the multi-day gap while a reviewer decides.
5. **Govern** — UiPath receives test results, hosts the approval task in Action Center, and triggers new runs on change events.

---

## Architecture

Two altitudes. UiPath governs; Vercel Workflow gives the agent durability. They never compete for the orchestrator role.

```
┌─────────────────────────────────────────────────────────────┐
│  UiPath Automation Cloud  — ENTERPRISE CONTROL PLANE         │
│  • Test Cloud: execution surface + test results management   │
│  • Orchestrator/Maestro: WHEN tests run (risk/change trigger)│
│  • Action Center: who-approves, human-in-the-loop tasks      │
│  • Governance: audit trail, org-level policy                 │
└───────────────▲─────────────────────────┬───────────────────┘
                │ results / status          │ triggers a run
                │                           ▼
┌───────────────┴─────────────────────────────────────────────┐
│  Proctor  — THE DURABLE QA AGENT  (TS/Next on Vercel)        │
│  Vercel Workflow = its durable brain (survives interruptions)│
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ Contract   │ │ Runner +   │ │ Drift      │ │ Heal +    │ │
│  │ Learner    │→│ Assertion  │→│ Classifier │→│ Approval  │ │
│  │            │ │ Engine     │ │            │ │ (hook)    │ │
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │ exercises
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  SUT: Invoice-Extraction Agent                               │
│  Deliberately non-deterministic LLM agent; supports a        │
│  "degraded" model label that mis-extracts totals to demo     │
│  regressions.                                                │
└──────────────────────────────────────────────────────────────┘
```

The UiPath `UiPathGateway` adapter is the seam between the planes:

| Proctor concept         | UiPath surface                         |
|-------------------------|----------------------------------------|
| `TestReport`            | Test results / test sets (Test Cloud)  |
| Approval pause (hook)   | Action Center approval task            |
| Change trigger          | Orchestrator / Maestro trigger         |
| `GovernanceEvent`       | Audit trail / dashboards               |

Two implementations sit behind `UiPathGateway`:
- **`LocalGateway`** — records events to disk + the Next.js dashboard. Default; no credentials required. Run today.
- **`TestCloudGateway`** — REST stubs ready to wire when UiPath Labs credentials land (`packages/uipath/src/testcloud.ts`).

---

## Quickstart

```bash
# Install dependencies
pnpm install

# Keyless demo — narrates the full Proctor logic deterministically
pnpm demo

# Live dashboard — full workflow with pause/resume approval
pnpm dev
# Open http://localhost:3000
# Defaults: PROCTOR_FAKE_LLM=1  PROCTOR_GATEWAY=local  (no API key needed)

# Unit tests (76 tests)
pnpm test

# Integration test (pause/resume cycle)
pnpm test:int
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js     | 20+     | Repo developed on Node 24 |
| pnpm        | 9.12.0  | `corepack enable` or install globally |
| `ANTHROPIC_API_KEY` | — | Only needed for the real (non-fake) LLM path. Not required for `pnpm demo` or `pnpm test`. |
| UiPath creds | — | Only needed for `PROCTOR_GATEWAY=testcloud`. See below. |

All tests and the demo run **keyless** by default (`PROCTOR_FAKE_LLM=1`, `PROCTOR_GATEWAY=local`).

---

## Connecting real UiPath Test Cloud

When UiPath Labs credentials are available, set the full env var set and flip the gateway:

```bash
# Required
export UIPATH_BASE_URL=https://cloud.uipath.com   # Automation Cloud base URL
export UIPATH_TENANT=<your-tenant>                # tenant name ({tenantName} URL segment)
export UIPATH_PAT=<personal-access-token>         # sent as Authorization: Bearer

# Required for real Cloud calls (each is asserted where used, with a clear error)
export UIPATH_ORG=<organization-name>             # {organizationName} URL segment
export UIPATH_FOLDER_ID=<folder-id>               # Orchestrator folder / OrganizationUnit id → X-UIPATH-OrganizationUnitId
export UIPATH_PROCTOR_RELEASE_KEY=<release-uuid>  # ReleaseKey of the Proctor process (StartJobs)
export UIPATH_TEST_SET_ID=<test-set-id>           # Test Set Proctor reports against

# Optional
export UIPATH_TASK_CATALOG=<catalog-name>         # Action Center task catalog for external tasks

export PROCTOR_GATEWAY=testcloud
pnpm dev
```

The `TestCloudGateway` in `packages/uipath/src/testcloud.ts` is **wired against the
public UiPath Automation Cloud REST API** (endpoints + request/response shapes built
from the docs, cited inline). The endpoints it talks to:

| Proctor call            | UiPath endpoint                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `pushTestResult`        | `POST .../orchestrator_/api/TestAutomation/StartTestSetExecution?testSetId=&triggerType=ExternalTool` |
| `openApprovalTask`      | `POST .../orchestrator_/tasks/GenericTasks/CreateTask` (`type: "ExternalTask"`) |
| `triggeredRun`          | `POST .../orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs` |
| `recordGovernanceEvent` | none — UiPath's Audit Log API is read-only; event is warned, not persisted remotely (use `local` for a persisted trail) |

> **Honest status: this path is wired-but-unverified-against-a-live-tenant.** It has
> NOT been run against a real UiPath tenant — no credentials yet. Every uncertain
> endpoint/field carries a `// VERIFY:` comment with its doc URL in `testcloud.ts`.
> Once creds land the remaining work is "plug credentials + verify," not new
> development.

### Post-credentials verification checklist

After provisioning the env vars above and setting `PROCTOR_GATEWAY=testcloud`:

1. **Flip the gateway** and run one full Proctor cycle (`pnpm dev`, then drive a run).
2. **Test result** — confirm a Test Set execution appears in UiPath Test Cloud /
   Test Automation for `UIPATH_TEST_SET_ID`, and confirm whether the API wants the
   external result in the body vs. query params (the `pushTestResult` `// VERIFY:`).
3. **Approval task** — confirm a `Proctor: <kind> on <sut>` external task appears in
   **Action Center**, that the `priority` enum/casing is accepted, that `data` carries
   the verdict, and that the created task `id` field name matches (`id` vs `Id`).
4. **Triggered run** — confirm `StartJobs` accepts `Strategy: "ModernJobsCount"` for
   the Proctor process's folder type, that the process declares matching input
   arguments (`changeId`, `sutId`, `touched`), and that a job `Id` is returned.
5. **Folder header** — confirm `X-UIPATH-OrganizationUnitId` = `UIPATH_FOLDER_ID` is
   accepted on all folder-scoped calls.
6. **Walk every `// VERIFY:` in `packages/uipath/src/testcloud.ts`** and resolve it
   against the tenant's Swagger (`.../orchestrator_/swagger/index.html`).

---

## Known limitations & production hardening

Proctor is a working MVP scoped for the hackathon. The following are deliberate scope boundaries, documented honestly for anyone extending it toward production:

- **Approval endpoint is unauthenticated.** `POST /api/approve` resumes a workflow from a deterministic hook token with no authn/authz/CSRF and no server-side task lookup. This is fine for the local demo (no exposed attacker surface) but a production deployment must put the approval action behind authentication, verify the reviewer's authority, and look the task up server-side rather than trusting a client-supplied token. In the intended architecture this approval lives in **UiPath Action Center**, which provides the identity and governance layer.
- **Regression detection leans on invariants, not golden values — by design.** Because the systems-under-test are *non-deterministic*, Proctor does **not** assert golden output equality. The runner derives its in-run baseline from the first observed output and relies on **invariants** (e.g. `sum_line_items_eq_total`) — absolute properties that hold regardless of baseline — plus semantic tolerance bands. This is the core thesis (you can't unit-test an LLM agent with `==`). The known consequence: a *uniformly* wrong SUT could self-baseline for the field-level (non-invariant) checks. The planned enhancement is to persist learned reference values in the `Contract` so semantic-drift detection no longer depends on the in-run baseline; invariants already cover value correctness today.
- **Step granularity.** `pushToUiPathStep` bundles more than one side effect in a single retryable step, and the approval hook token isn't embedded in the Action Center task payload. Splitting these and persisting the token are straightforward follow-ups for stronger idempotency and self-contained approvals.

These are tracked as open follow-ups; none affect the demonstrated end-to-end flow (all tests pass and the live suspend→resume cycle is verified).

---

## Built with coding agents

The entire Proctor solution — monorepo structure, engine packages, workflow steps, Next.js dashboard, test suite, and this documentation — was built by **Claude Code** (Anthropic's coding agent). The git commit history is the evidence.

This satisfies the UiPath AgentHack 2026 coding-agent bonus requirement.

---

## License

MIT — see [LICENSE](./LICENSE).
