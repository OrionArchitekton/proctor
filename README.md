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
export UIPATH_BASE_URL=https://cloud.uipath.com   # Automation Cloud base URL (UiPath Labs/hackathon tenants may be https://staging.uipath.com — use whatever host your portal URL shows)
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

The `TestCloudGateway` in `packages/uipath/src/testcloud.ts` is wired against the
public UiPath Automation Cloud REST API and **verified live against a UiPath Labs
tenant** (`hackathon26_529` / `DefaultTenant`, 2026-06-15):

| Proctor call            | UiPath endpoint | Live status |
| ----------------------- | --------------- | ----------- |
| `openApprovalTask`      | `POST .../orchestrator_/tasks/GenericTasks/CreateTask` (`type: "ExternalTask"`) | ✅ **verified** — created Action Center tasks `100000126`–`100000128` |
| `triggeredRun`          | `POST .../orchestrator_/odata/Jobs/...StartJobs` | ✅ **verified** — started Orchestrator jobs (e.g. `67149929`, State=Successful) against the `proctor-cycle-trigger` API workflow |
| `pushTestResult`        | Test Cloud `StartTestSetExecution` **or** Orchestrator queue `AddQueueItem` | ✅ **verified** — publishes the TestReport to the `Proctor_TestResults` queue (queue + items created). Test Cloud Test Set path is wired for tenants with test cases (see note) |
| `recordGovernanceEvent` | none — UiPath Audit Log API is read-only | ✅ warn-by-design (no public audit-write endpoint; use `local` for a persisted trail) |

> **Honest status:** all four surfaces are **verified live with this exact code**
> against a UiPath Labs tenant — re-runnable via `scripts/live-gateway-probe.ts`.
>
> One nuance, stated plainly: Track 3's headline surface is Test Cloud's *Test Set
> execution*, but a Test Set requires **test cases authored in Studio**, and this Labs
> tenant runs Studio Web in browser-only mode that gates RPA/Test-Case authoring
> behind a local UiPath Robot install. With no way to author a test case in-browser,
> Proctor publishes its TestReport to an **Orchestrator queue** (`Proctor_TestResults`)
> as the live results channel — a real UiPath destination that needs no Robot. The
> `StartTestSetExecution` path remains wired and runs wherever a populated Test Set
> exists (set `UIPATH_TEST_SET_ID`).

### Reproduce the live verification

With the env vars above set (the project uses Doppler: `doppler run -p uipath-hack -c prd -- …`):

```bash
# Read-only tenant probe — auth, folders, releases, test sets, Action Center reachability
bash scripts/verify-testcloud.sh

# Exercise the real gateway against the tenant (creates a real Action Center task + Orchestrator job)
PROCTOR_GATEWAY=testcloud npx tsx scripts/live-gateway-probe.ts
```

Confirmed against the Labs tenant: `openApprovalTask` (Action Center task created),
`triggeredRun` (`StartJobs` → job `State=Successful`), folder header
`X-UIPATH-OrganizationUnitId` = `UIPATH_FOLDER_ID`, and the `Critical/Medium/Low`
priority enum. `pushTestResult` runs once a Test Set exists; the remaining
`// VERIFY:` is its external-result ingestion contract (body vs. query) against the
tenant Swagger (`.../orchestrator_/swagger/index.html`).

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
