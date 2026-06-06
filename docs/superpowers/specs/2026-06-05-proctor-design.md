# Proctor — Design Spec

**Project:** Proctor — the agent that QAs other agents
**Event:** UiPath AgentHack 2026 (Track 3: UiPath Test Cloud)
**Date:** 2026-06-05
**Deadline:** 2026-06-29 @ 11:45pm PDT
**Status:** Approved design, pre-implementation

---

## 1. Summary

Proctor is a coding-agent-built QA agent that regression-tests **non-deterministic AI
automations**. It learns each automation's *behavioral contract*, catches when a model or
prompt change silently breaks it, self-heals the tests when the change is legitimate, and
escalates real regressions to a human — all orchestrated and governed by the UiPath Platform.

The novel wedge: **"an agent that QAs other agents."** Regression-testing a non-deterministic
LLM agent is genuinely hard (naive `output == expected` either flakes constantly or passes on
garbage). Proctor solves it with a hybrid behavioral-contract methodology plus an LLM drift
classifier that distinguishes *real regression* from *legitimate evolution* from *flaky noise*.

### Why this wins (mapping to judging criteria)
- **Creativity & Innovation** — regression testing for non-deterministic agents is novel; the
  meta-framing ("agent that QAs agents") is memorable.
- **Platform Usage** — UiPath is the genuine enterprise orchestration/governance plane; the
  whole thing is built *by* Claude Code → **coding-agent bonus points**.
- **Technical Execution** — durable workflow with per-step retry handles interruptions/failures
  exactly as the rubric asks.
- **Business Impact** — silent AI-automation regressions cost real money (mis-extracted invoice
  totals); Proctor is the safety net every enterprise deploying agents will need.
- **Completeness** — runs today via a local UiPath adapter; reproducible by judges.

---

## 2. Track & constraints

- **Track 3: UiPath Test Cloud.** "Create agents that use UiPath Test Cloud to reimagine how
  software testing is designed, automated, executed, and managed." Explicitly invites validating
  "AI-infused workflows, including third-party agents or AI services that participate in a
  UiPath-orchestrated process" — Proctor targets exactly this.
- **Hard requirement:** solution must run on UiPath Automation Cloud with UiPath as the
  orchestration + governance layer. External frameworks/LLMs welcome underneath.
- **UiPath Labs access:** requested, pending (~3 business days). Design must not block on it.
- **Submit:** Devpost page, ≤5-min demo video (show it running), public GitHub repo (MIT),
  solution on UiPath Cloud, presentation deck.

---

## 3. Architecture — two altitudes

UiPath and Vercel Workflow operate at **different altitudes and never compete for the
orchestrator role** — this is the spine of the submission.

```
┌─────────────────────────────────────────────────────────────┐
│  UiPath Automation Cloud  — ENTERPRISE CONTROL PLANE         │
│  • Test Cloud: execution surface + test results management   │
│  • Orchestrator/Maestro: WHEN tests run (risk/change trigger)│
│  • Governance: who-approves, audit trail, org-level policy   │
└───────────────▲─────────────────────────┬───────────────────┘
                │ results / status          │ triggers a run
                │                           ▼
┌───────────────┴─────────────────────────────────────────────┐
│  Proctor  — THE DURABLE QA AGENT  (TS/Next on Vercel)        │
│  Vercel Workflow = its durable brain (survives interruptions)│
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐  │
│  │ Contract   │ │ Runner +   │ │ Drift      │ │ Heal +    │  │
│  │ Learner    │→│ Assertion  │→│ Classifier │→│ Approval  │  │
│  │            │ │ Engine     │ │            │ │ (hook)    │  │
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ exercises
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  SUT: Invoice-Extraction Agent (deliberately non-deterministic│
│  LLM agent we build, so we can demo drift on a model swap)     │
└──────────────────────────────────────────────────────────────┘
```

- **UiPath** governs at the org level: *when/whether* tests run, *who* approves, audit.
- **Vercel Workflow** gives the *agent itself* durability so its multi-day heal-and-approve loop
  survives interruptions — the exact phrase in the judging criteria.

### Stack
TypeScript / Next.js, Vercel Workflow DevKit, Anthropic Claude (SUT + judge + classifier),
deployable to Vercel. Monorepo (pnpm workspaces).

---

## 4. Components

Each unit has one job, a clear interface, and is independently testable.

### 4.1 Contract Learner
- **What:** given an SUT agent + a small golden input set, runs the agent N times and synthesizes
  its **behavioral contract**: per output field, the right assertion altitude
  (structural / exact-value / semantic) plus invariants (`sum(line_items) == total`, currency
  consistent, dates parseable).
- **Interface:** `learnContract(sutRef, goldenInputs) → Contract`
- **Depends on:** SUT runner + Claude (proposes assertion altitudes + invariants from observed outputs).

### 4.2 Runner + Assertion Engine
- **What:** executes the SUT over inputs and evaluates each output against the contract.
  Three assertion kinds:
  - **structural** — schema/types (deterministic)
  - **exact** — numeric/computed fields that *should* be deterministic (deterministic)
  - **semantic** — LLM-judge or embedding similarity for fuzzy fields, with a confidence threshold
- **Interface:** `runContract(sutRef, contract) → TestReport` (pass/fail per assertion + evidence)
- **Depends on:** SUT runner, Claude judge.

### 4.3 Drift Classifier (novel core)
- **What:** when assertions fail, classifies the failure:
  - **real-regression** — behavior got worse → finding/alert
  - **legitimate-evolution** — output changed but still correct → contract is stale, propose patch
  - **flaky** — within non-deterministic tolerance → ignore
- **Interface:** `classifyDrift(report, baseline) → { verdict, rationale, proposedContractPatch? }`
- **Depends on:** baseline + Claude reasoning over the diff.

### 4.4 Heal + Approval
- **What:** on `legitimate-evolution` proposes a contract patch; on `real-regression` files a
  finding. **Always pauses on a human-approval hook before mutating a contract or signaling UiPath.**
- **Interface:** Vercel Workflow steps; pause via `createHook`.
- **Depends on:** Workflow runtime + UiPath result push.

### 4.5 Risk-based orchestration
Each contract carries a risk score from failure history + change-impact (did this change touch
the prompt/model/schema this contract covers?). On a trigger, Proctor runs highest-risk contracts
first and can short-circuit on budget. This satisfies the "right tests at the right time" requirement.
Scope: a scoring function + ordering, **not** a scheduler service.

---

## 5. Data flow (one cycle)

```
change detected (UiPath trigger / git push)
   → Runner executes SUT against active Contract
   → Assertion Engine → TestReport
   → if failures → Drift Classifier → verdict
        • flaky        → log, no action
        • regression   → finding → PAUSE (approval hook) → push result to UiPath Test Cloud
        • evolution    → propose contract patch → PAUSE (approval hook) → on approve, version contract
   → risk score updates (prioritize next change)
```

---

## 6. The heal loop as a Vercel Workflow

The whole QA cycle is **one durable workflow** so it survives the multi-day gap while a human
reviews. Workflow orchestrates; all real I/O lives in `"use step"` functions (full Node access,
auto-retry, replay-safe).

```typescript
// proctorCycle: one durable QA cycle per SUT change
export async function proctorCycle(sutRef: SutRef, changeCtx: ChangeContext) {
  "use workflow";
  const report = await runContract(sutRef, changeCtx.contract);     // step: exec SUT + assert
  if (report.allPassed) return await pushToUiPath(sutRef, report);  // step

  const verdict = await classifyDrift(report, changeCtx.baseline);  // step: LLM drift call
  if (verdict.kind === "flaky") return await pushToUiPath(sutRef, report);

  // real-regression OR legitimate-evolution → require a human
  const decision = createHook<ApprovalDecision>({
    token: `approve:${sutRef.id}:${changeCtx.changeId}`,
  });
  await notifyReviewer(sutRef, verdict);          // step: Slack/email + UiPath Action Center task
  const choice = await decision;                   // ⏸ suspends here — days are fine, state persists

  if (choice.approved && verdict.kind === "legitimate-evolution")
    await versionContract(sutRef, verdict.proposedContractPatch);   // step
  return await pushToUiPath(sutRef, { ...report, verdict, choice }); // step: governance record
}
```

- `createHook` + `token` = human-in-the-loop pause; resumed via `resumeHook(token, decision)` from
  a Next.js API route (reviewer clicks Approve/Reject; or UiPath Action Center resolves it).
- Each `"use step"` is retried + cached independently → transient LLM/UiPath blips don't restart
  the cycle (handles exceptions/failures per rubric).
- `getWritable()` streams live progress to the demo UI so the video shows the agent thinking.

---

## 7. UiPath Test Cloud seam

Creds are pending, so UiPath lives behind **one adapter interface** with two implementations.
Nothing else in the codebase knows which is live.

```typescript
interface UiPathGateway {
  triggeredRun(changeCtx): Promise<RunHandle>;        // Maestro/Orchestrator → Proctor entrypoint
  pushTestResult(sutRef, report): Promise<void>;      // results → Test Cloud
  openApprovalTask(sutRef, verdict): Promise<TaskId>; // governance → Action Center
  recordGovernanceEvent(evt): Promise<void>;          // audit trail
}
```

- **LocalGateway** — records governance events to disk + the Next UI. Default; used now and for the
  reproducible repo so judges can run it today.
- **TestCloudGateway** — real API; dropped in when Labs creds land. Wiring written + documented in README.

Concept → Test Cloud surface mapping:
| Proctor concept            | UiPath Test Cloud surface              |
|----------------------------|----------------------------------------|
| TestReport                 | Test results / test sets               |
| Approval pause (hook)      | Action Center approval task            |
| Change trigger             | Orchestrator / Maestro trigger         |
| Governance event           | Audit trail / dashboards               |

---

## 8. Demo script (≤5 min, must show it running)

1. **0:00–0:45** — Problem: AI automations silently regress on model/prompt changes; normal tests
   can't catch non-deterministic output. Show the invoice agent extracting correctly.
2. **0:45–2:00** — Proctor **learns the contract** live (tiered assertions + invariants appear),
   runs green.
3. **2:00–3:15** — **Inject a regression** (swap SUT model / nudge prompt). Re-run. Proctor flags
   failures; Drift Classifier reasons "real regression: totals mis-extracted," not flaky.
4. **3:15–4:15** — **Human-in-the-loop**: workflow pauses on approval hook; reviewer sees the
   finding (Next UI / UiPath Action Center), approves. Also show a *legitimate-evolution* case
   (vendor formatting changed but correct → contract patch proposed → approve → contract versioned).
5. **4:15–5:00** — Pull back to UiPath as the governance plane: results in Test Cloud, audit trail,
   risk-based scheduling. Close on: *"every line of Proctor was built by Claude Code"* → bonus.

---

## 9. Repo deliverables (public, MIT)

```
apps/web              Next.js: dashboard + approval UI + live stream
workflows/            proctorCycle + steps
packages/engine       Contract Learner, Assertion Engine, Drift Classifier, Heal (pure, unit-tested)
packages/sut-invoice  deliberately-non-deterministic invoice agent + sample invoices
packages/uipath       UiPathGateway + Local/TestCloud impls
README.md             what it does, UiPath components used, setup, prereqs, coding-agent disclosure
ARCHITECTURE.md       the two-altitude design
.env.example          ANTHROPIC_API_KEY, UIPATH_* (optional)
```
- Tests: engine units + a `@workflow/vitest` integration test of the pause/resume cycle.
- **Coding-agent bonus made explicit:** commit history is the evidence (Claude Code authorship),
  README "Built with coding agents" section, demo names it.

---

## 10. Scope / YAGNI boundary (deliberately NOT built)

- **One SUT** (invoice agent). No multi-domain SUT zoo.
- **One LLM provider** (Anthropic Claude) for SUT, judge, classifier — no provider abstraction.
- **LocalGateway is default**; TestCloudGateway exercised only when creds land (no blocking).
- **Risk orchestration = scoring + ordering**, not a scheduler service.
- **Approval UI = minimal** (list + approve/reject), not a full review console.
- No auth, no multi-tenant, no DB beyond workflow persistence + a JSON/SQLite contract store.

Goal: a single, polished, end-to-end working slice — which the rubric rewards over breadth.

---

## 11. Open items / dependencies

- **CRITICAL PATH (RESOLVED):** UiPath Labs access **requested Fri 2026-06-05**. With UiPath's
  ~3-business-day SLA, creds expected **~2026-06-10**. TestCloudGateway wiring waits on creds;
  all other work proceeds now. Deadline 2026-06-29 → ample buffer.
- Final project name (`Proctor` working title).
- Deck (UiPath template) — separate workstream from code.
- Team composition (1–4 people) — affects parallelism, not the design.
