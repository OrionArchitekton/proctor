# Proctor: Submission Deck (mapped to the UiPath 5-slide template)

Paste-ready content for the Proctor submission, mapped one to one onto the official UiPath AgentHack 5-slide template (Title, Problem statement and proposed solution, Benefits and technologies used, Solution architecture, Thank you).

How to submit:

1. Open the UiPath Google Slides template, then **File > Make a copy** into your own Drive.
2. Replace each slide's placeholder text with the matching "## Slide N" section below. Slide 3's table maps row for row onto the template's information table.
3. Set sharing to **Anyone with the link** (Viewer), then paste the link into the Devpost submission and submit.

Every UiPath claim below is grounded in the live repo (`packages/uipath/src/testcloud.ts`, `README.md`). Numbers are real verified anchors only, no invented benchmarks. Verified live against the UiPath Labs tenant `hackathon26_529` / `DefaultTenant` on 2026-06-15.

---

## Slide 1: Title

**Title:** Proctor: the agent that QAs other agents

**Subtitle (one line):** Regression testing for non-deterministic AI automations, governed by the UiPath Platform: Proctor learns each agent's behavioral contract, catches silent regressions when a model or prompt changes, and escalates real failures to a human.

*Context line (footer or speaker note):* UiPath AgentHack 2026, Track 3: UiPath Test Cloud. Agent type: Coded Agent (TypeScript, integrating UiPath via the public REST API). Built by Claude Code (coding-agent bonus). Dan Mercede.

---

## Slide 2: Problem statement and proposed solution

**Problem:** AI automations are non-deterministic: the same input rarely produces byte-identical output, so the moment someone swaps a model or tweaks a prompt, behavior can silently drift and no traditional test catches it. Classic regression testing (output == expected) is unusable here; it either flakes constantly or passes on garbage. A mis-extracted invoice total is real money, yet today nobody catches it until a human notices downstream. Enterprises are deploying these agents at scale with no regression safety net designed for non-deterministic output.

**Solution:** Proctor is a coded QA agent that tests other AI automations. It learns a per-agent behavioral contract (structural, exact, and semantic assertions plus hard domain invariants, like line items summing to the total), then re-checks on each change using invariants and semantic similarity instead of brittle equality. A drift classifier separates real regression from legitimate evolution and flakiness; on a consequential change it suspends a durable workflow for human approval (surviving multi-day reviewer gaps), routed through UiPath, then either files the regression or versions the contract.

---

## Slide 3: Benefits and technologies used

Left table (maps row for row onto the template's information table):

| Template row | Value |
|---|---|
| End-user | QA and platform engineers operating production AI automations; reviewers who approve drift in Action Center |
| User department | Engineering / Platform QA / AI governance and risk |
| Industries | Finance and accounts payable (invoice extraction), insurance claims, customer support triage; any regulated industry running LLM automations |
| UiPath products used | Orchestrator Jobs (StartJobs on the `proctor-cycle-trigger` API workflow, verified live); Orchestrator Queues (AddQueueItem to `Proctor_TestResults`, the live results channel); Action Center (external approval tasks via GenericTasks/CreateTask, verified live); Test Cloud (Test Set execution via StartTestSetExecution, wired for tenants with a populated Test Set) |
| Other integrations / APIs / technologies | TypeScript, pnpm monorepo, Next.js, Vercel Workflow DevKit, Anthropic Claude (Vercel AI SDK), Zod, Vitest; built by Claude Code (coding-agent bonus) |

Right column, "Benefits, impact and outcomes":

- Closes a real gap: a regression safety net for non-deterministic agents, where output == expected does not work.
- Verified live, not mocked: a real Orchestrator job (`67149929`, State=Successful), Action Center tasks (`100000126` to `100000128`), and results published to the `Proctor_TestResults` queue, all run by this exact code against a UiPath Labs tenant.
- Production-shaped governance: durable, human-in-the-loop approvals routed through Action Center, with UiPath holding the audit and policy layer.
- Distinguishes broke from changed-but-still-correct: the drift classifier proposes a contract patch for legitimate evolution (still human-approved), so a still-correct model or prompt change versions the contract rather than being filed as a regression.
- Keyless and reproducible for judges (`pnpm install && pnpm demo`); 76 unit tests plus a real durable pause/resume integration test, all green.

---

## Slide 4: Solution architecture

UiPath Automation Cloud is the enterprise control plane (Test Cloud, Orchestrator triggers and queues, Action Center approvals, audit), and the Vercel Workflow DevKit is the agent's durable runtime, giving the learn, run, classify, escalate loop crash-safe pause/resume across multi-day human approvals. A single `UiPathGateway` adapter is the seam: `LocalGateway` runs keyless on disk and drives the Next.js dashboard, while `TestCloudGateway` makes real Automation Cloud REST calls (all four surfaces verified live), selected by flipping one env flag (`PROCTOR_GATEWAY=testcloud`). Full diagrams and the per-step data flow live in the repo.

**GitHub Repo:** https://github.com/OrionArchitekton/proctor

---

## Slide 5: THANK YOU

Proctor is the safety net for the agentic enterprise: AI automations are easy to build and hard to keep correct as models and prompts change. Run it keyless: `pnpm install && pnpm demo` (live dashboard via `pnpm dev`). Repo (MIT): github.com/OrionArchitekton/proctor

---

## Appendix: speaker notes and demo flow

Not slides. Kept from the longer working deck so the narrative survives the collapse to five template slides. Use for the talk track, the optional demo video, or the Devpost long description.

**The cycle (Learn, Run, Classify, Escalate, Govern).**
1. Learn: run the agent over sample inputs; synthesize a versioned `Contract` (structural / exact / semantic assertions plus invariants like `sum_line_items_eq_total`).
2. Run: re-evaluate on a change using invariants and semantic scoring, not equality.
3. Classify: real-regression, legitimate-evolution, or flaky. This classification is the novel part: it separates "it broke" from "it changed but is still correct."
4. Escalate: pause a durable workflow on a human-approval hook that survives interruptions. Both real regressions and legitimate evolution pause for a human.
5. Govern: results, approval, and triggers flow through UiPath.

**Demo (about 5 minutes): catching a real regression.**
- Good model: the contract passes (green).
- Degrade the model: totals stop summing, so an invariant is violated.
- Drift classifier: real-regression, not flaky, not evolution.
- Workflow suspends, a human approves in Action Center, the workflow resumes and records. The pause/resume is genuinely durable, verified against the runtime event log.
- Add the demo-video link wherever the Devpost form requests it.

**Built by a coding agent.** Spec, plan, and test-driven implementation, fully agent-authored by Claude Code (the git history is the evidence). 76 unit tests plus a real pause/resume integration test; typecheck clean; the pure dependency-injected engine runs keyless in CI (`PROCTOR_FAKE_LLM=1`). This satisfies the separate "UiPath for Coding Agents" bonus, and is distinct from Proctor itself being a coded agent.
