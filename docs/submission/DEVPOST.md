# Proctor — the agent that QAs other agents

**Track:** UiPath AgentHack 2026 — Track 3: UiPath Test Cloud
**Repo:** https://github.com/OrionArchitekton/proctor (MIT)

---

## Tagline (one line)

An agentic QA system that regression-tests *non-deterministic* AI automations — it learns each agent's behavioral contract, catches silent regressions when a model or prompt changes, self-heals its tests, and escalates real failures to a human — all governed by UiPath.

## Inspiration

Coding agents have made it trivial to *build* AI automations. The hard, unsolved part is *operating* them safely. An LLM-based automation that extracts invoices, triages tickets, or summarizes claims gives a slightly different answer every run — so the moment someone swaps the model or tweaks a prompt, behavior can silently drift and no traditional test catches it. `assertEqual(output, expected)` either flakes constantly or passes on garbage. Enterprises are now deploying thousands of these agents with **no regression safety net**. That gap is what Proctor fills.

## What it does

Proctor is a coding-agent-built QA agent that tests *other* AI automations:

1. **Learns a behavioral contract.** It runs the target agent over a sample set, observes which fields are stable vs. variable, and synthesizes a contract of tiered assertions (structural / exact / semantic) plus hard **invariants** (e.g. line items must sum to the total).
2. **Detects regressions in non-deterministic output.** It re-runs the agent on a change and evaluates against the contract — using semantic similarity and invariants rather than brittle equality.
3. **Classifies the drift.** A classifier decides: **real-regression** (behavior got worse → alert), **legitimate-evolution** (output changed but is still correct → propose a contract patch), or **flaky** (within tolerance → ignore).
4. **Keeps a human in charge.** On any consequential change it **suspends a durable workflow on a human-approval hook** — surviving interruptions for as long as the reviewer needs — then resumes and either files the regression or versions the contract.
5. **Orchestrates by risk.** It scores which contracts to run first based on failure history and what the change touched (model / prompt / schema).

The demo system-under-test is a deliberately non-deterministic **invoice-extraction agent**: flip it from the "good" model to a "degraded" one and Proctor catches the broken total live, classifies it as a real regression, and routes it to a human for approval.

## How we built it

- **Two-altitude architecture.** **UiPath is the enterprise control plane** — Test Cloud receives the test results, Action Center hosts the human approval task, Orchestrator/Maestro triggers runs on change, and the audit trail records every decision. The **Vercel Workflow DevKit** is the agent's own *durable runtime* — the heal-and-approve loop that survives interruptions and human-in-the-loop pauses. The two never compete for the orchestrator role; they operate at different altitudes.
- **Pure, dependency-injected engine.** The assertion engine, contract learner, drift classifier, risk scorer, and contract store live in a pure `@proctor/engine` package with all LLM/I/O injected — so it's fully unit-tested and runs **keyless** in CI.
- **UiPath behind one adapter — verified live.** A `UiPathGateway` interface has a `LocalGateway` (disk + dashboard) and a `TestCloudGateway` (real Automation Cloud REST). All four surfaces are **verified live against a UiPath Labs tenant** with our actual code: `openApprovalTask` created real **Action Center** tasks (`100000126`–`128`); `triggeredRun` started an **Orchestrator** job (`67149929`, State=Successful) on a published API workflow; `pushTestResult` publishes each TestReport to an **Orchestrator queue** (`Proctor_TestResults`); governance warns honestly (UiPath has no public audit-write API). Re-runnable via `scripts/live-gateway-probe.ts`. *(Test Cloud's Test Set execution is wired too, but this Labs tenant gates Test-Case authoring behind a local Robot install, so the queue is the live results channel.)*
- **Built entirely by Claude Code.** Every line — monorepo, engine, durable workflows, Next.js dashboard, 77 tests, and docs — was produced by the Claude Code coding agent through a spec → plan → test-driven-implementation pipeline. The git history is the evidence. *(This is the hackathon's coding-agent bonus.)*

**Stack:** TypeScript, pnpm monorepo, Next.js, Vercel Workflow DevKit, Anthropic Claude, Zod, Vitest.

## Challenges we ran into

- **Testing the untestable.** The central problem — asserting on non-deterministic output — drove the whole design toward invariants + semantic tolerance + a baseline-aware runner instead of golden-value equality.
- **Two orchestrators, one role.** Reconciling "UiPath must orchestrate" with a durable workflow engine required the altitude split: UiPath governs at the org level; Vercel Workflow gives the *agent itself* durability.
- **Proving durability is real.** We have an integration test that genuinely suspends the workflow on a hook and resumes it — verified against the runtime's event log (`hook_created → hook_received → run_completed`), not mocked.

## Accomplishments we're proud of

- A working end-to-end durable pause→approve→resume loop, verified live.
- A novel, defensible answer to "how do you regression-test a non-deterministic agent?"
- A clean UiPath governance seam that runs locally today and connects to Test Cloud with a single env flip.
- 76 unit + 1 integration test, all green; keyless reproducibility for judges.

## What we learned

You cannot QA an AI agent the way you QA a function. The durable unit of trust is a **behavioral contract** enforced by absolute invariants and tolerance bands — and the governance layer (who approves, what's audited) matters as much as the detection logic.

## What's next

- Populate a UiPath Test Set (needs Studio-authored test cases) so `pushTestResult` runs through Test Cloud's Test Set execution in addition to the live Orchestrator-queue results channel.
- Persist learned reference values for richer semantic-drift detection.
- Authentication on the approval action (production), step-granularity hardening, and a multi-SUT risk dashboard.

## Built with

`uipath-test-cloud` · `uipath-orchestrator` · `uipath-action-center` · `claude-code` · `anthropic-claude` · `vercel-workflow` · `typescript` · `next.js` · `zod` · `vitest` · `pnpm`

## Try it (keyless, no API key needed)

```bash
pnpm install
pnpm demo          # narrated end-to-end logic
pnpm dev           # live dashboard at localhost:3000
pnpm test && pnpm test:int   # 76 unit + 1 durable pause/resume integration test
```
