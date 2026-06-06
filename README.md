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

When UiPath Labs credentials are available:

```bash
export UIPATH_BASE_URL=https://cloud.uipath.com
export UIPATH_TENANT=<your-tenant>
export UIPATH_PAT=<personal-access-token>
export PROCTOR_GATEWAY=testcloud
pnpm dev
```

The `TestCloudGateway` in `packages/uipath/src/testcloud.ts` contains the wired endpoints with TODOs for the final request-body mapping per the Test Cloud API spec. The adapter compiles and is integrated today; the TODOs are blocked only on live credentials to exercise and finalize the response shapes.

---

## Built with coding agents

The entire Proctor solution — monorepo structure, engine packages, workflow steps, Next.js dashboard, test suite, and this documentation — was built by **Claude Code** (Anthropic's coding agent). The git commit history is the evidence.

This satisfies the UiPath AgentHack 2026 coding-agent bonus requirement.

---

## License

MIT — see [LICENSE](./LICENSE).
