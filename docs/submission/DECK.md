# Proctor: Presentation Deck (content, slide by slide)

Each `##` below is one slide: a headline, tight bullets, and a speaker note. Reads in about 3 to 4 minutes.

**Submitting on the required UiPath template** (per the Devpost reviewer, the deck must live on UiPath's Google Slides template):
1. Open the template, then **File > Make a copy** into your own Drive.
2. For each template slide, paste the matching block below. The template's "UiPath products used" and "agent type" fields map to **slides 1 and 6**.
3. Set the copy to **anyone with the link can view**, then submit that link on Devpost.

---

## 1 — Title
**Proctor — the agent that QAs other agents**
Regression testing for non-deterministic AI automations, governed by UiPath.

- UiPath AgentHack 2026 · **Track 3: UiPath Test Cloud**
- Dan Mercede · Repo: github.com/OrionArchitekton/proctor
- **Agent type: Coded Agent** (TypeScript), integrating UiPath via the public REST API
- Built entirely by Claude Code (the coding-agent bonus)

*Note: One line — "AI automations are easy to build and almost impossible to keep correct. Proctor is the safety net."*

---

## 2 — The problem
**You can't unit-test an LLM agent with `==`**

- AI automations are **non-deterministic** — same input, slightly different output every run.
- Swap a model or tweak a prompt → behavior **silently drifts**. No traditional test catches it.
- `assertEqual(output, expected)` either **flakes constantly** or **passes on garbage**.
- Enterprises are deploying thousands of these agents with **no regression safety net**.

*Note: A mis-extracted invoice total is real money. Today nobody catches it until a human notices downstream.*

---

## 3 — The solution
**A behavioral contract + a drift classifier + a human in the loop**

- **Learn** a behavioral contract per agent (tiered assertions + hard invariants).
- **Detect** regressions via invariants & semantic similarity — not brittle equality.
- **Classify** the drift: real-regression · legitimate-evolution · flaky.
- **Escalate** real regressions to a human on a durable approval hook.
- **Govern** it all through UiPath.

*Note: The novel bit is classification — distinguishing "it broke" from "it changed but is still correct."*

---

## 4 — How it works (the cycle)
**Learn → Run → Classify → Escalate → Govern**

1. **Learn** — run the agent over sample inputs; synthesize a versioned `Contract` (structural / exact / semantic assertions + invariants like `sum_line_items_eq_total`).
2. **Run** — re-evaluate on a change; invariants + semantic scoring, not `==`.
3. **Classify** — real-regression / legitimate-evolution / flaky.
4. **Escalate** — pause a **durable workflow** on a human-approval hook (survives interruptions).
5. **Govern** — results + approval + trigger flow through UiPath.

*Note: Steps 2–4 are where non-determinism is actually handled.*

---

## 5 — Architecture: two altitudes that never compete
**UiPath governs the org. Vercel Workflow makes the agent durable.**

- **UiPath = enterprise control plane** — Test Cloud, Orchestrator (triggers), Action Center (approvals), audit.
- **Vercel Workflow = the agent's durable runtime** — the heal-and-approve loop that survives restarts and multi-day human pauses.
- One `UiPathGateway` adapter is the seam: `LocalGateway` (runs anywhere) ↔ `TestCloudGateway` (real UiPath).

*Note: This is the design crux — they operate at different altitudes, so "UiPath orchestrates" and "the agent is durable" are both true.*

---

## 6: UiPath components, running live (verified, not mocked)
**Every component exercised against a real UiPath Labs tenant**

- **Test Cloud** *(Track 3)*: receives each TestReport via Test Set execution; runs wherever a Test Set is populated.
- **Orchestrator (Jobs)**: `StartJobs` ran the `proctor-cycle-trigger` API workflow, **State = Successful**, inputs bound from the agent.
- **Orchestrator (Queues)**: every TestReport published to `Proctor_TestResults`, the live results channel.
- **Action Center**: real approval task created (`Proctor: real-regression on invoice`, Critical).
- **API Workflows**: `proctor-cycle-trigger`, the published process the Jobs call invokes.
- **Governance**: honest by design (UiPath exposes no audit-write API).

*Note: Flip one env flag (`PROCTOR_GATEWAY=testcloud`) and the same agent talks to the real platform. Re-runnable via `scripts/live-gateway-probe.ts`.*

---

## 7 — Demo: catching a real regression
**Invoice-extraction agent → degrade the model → Proctor catches it**

- Good model → contract passes (green).
- Degrade the model → totals stop summing → **invariant violated**.
- Drift classifier → **real-regression** (not flaky, not evolution).
- Workflow **suspends** → human approves in Action Center → **resumes** & records.

*Note: This is the 5-minute video flow. The pause/resume is genuinely durable — verified against the runtime event log.*

---

## 8 — Built by a coding agent
**Every line written by Claude Code — the bonus, demonstrated**

- spec → plan → test-driven implementation, fully agent-authored (git history is the evidence).
- 76 unit tests + a real pause/resume integration test; typecheck clean.
- Pure, dependency-injected engine → runs **keyless** in CI (`PROCTOR_FAKE_LLM=1`).

*Note: Directly satisfies the "UiPath for Coding Agents" bonus under Platform Usage.*

---

## 9 — Why it matters
**The safety net for the agentic enterprise**

- **Business impact** — silent AI regressions cost real money; Proctor is the missing QA layer.
- **Novel** — regression testing for non-deterministic agents; "an agent that QAs agents."
- **Production-shaped** — durable, human-in-the-loop, governed, auditable.

---

## 10 — Links
- **Repo (MIT):** github.com/OrionArchitekton/proctor
- **Run it keyless:** `pnpm install && pnpm demo` · live app `pnpm dev`
- **Demo video:** [link]
- Built with: UiPath (Action Center · Orchestrator · Test Cloud) · Vercel Workflow · Anthropic Claude · Claude Code · TypeScript / Next.js
