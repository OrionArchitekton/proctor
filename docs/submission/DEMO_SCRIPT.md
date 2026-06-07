# Proctor — 5-Minute Demo Video Script & Shot List

**Target:** ≤ 5:00. Must show the solution *running* (not slides), walk the architecture, name the agents + orchestration, and show where humans fit. Judges score Presentation + Platform Usage + Technical Execution.

**Pre-roll setup (before recording):**
```bash
# terminal 1 — keyless live app
PROCTOR_FAKE_LLM=1 PROCTOR_GATEWAY=local PROCTOR_DATA_DIR=.proctor-demo pnpm dev
# open http://localhost:3000
# have a second terminal ready for `pnpm demo` (optional B-roll)
```
Record at 1080p+, large font, dark theme. Pre-open the GitHub repo tab and the architecture diagram.

---

## 0:00–0:35 — The problem (hook)

**On screen:** the invoice-extraction agent producing a correct result; then a quick text overlay: `total = sum(line items) ✓`.

**Narration:**
> "Coding agents made it easy to *build* AI automations. The hard part is operating them. This invoice agent uses an LLM — so it gives a slightly different answer every run. The moment someone swaps the model or edits the prompt, it can silently start mis-extracting totals — real money — and no normal test catches it, because `assertEqual` either flakes or passes on garbage. This is Proctor: an agent that QAs other agents."

## 0:35–1:05 — Architecture (the one slide allowed)

**On screen:** the two-altitude diagram (UiPath governance plane on top; Proctor durable agent below; SUT at the bottom).

**Narration:**
> "Two altitudes that never compete. **UiPath is the enterprise control plane** — Test Cloud takes the results, Action Center hosts the human approval, Orchestrator triggers runs, everything is audited. **Underneath, Proctor is a durable agent** built on Vercel Workflow — its heal-and-approve loop survives interruptions. And every line of Proctor was built by **Claude Code** — the coding-agent bonus."

## 1:05–1:45 — Learn the contract (live)

**On screen:** click **Bootstrap / Re-learn contract**. The contract panel fills in: fields with kind chips + the four invariants.

**Narration:**
> "First, Proctor *learns the agent's behavioral contract*. It runs the invoice agent over sample invoices, sees which fields are stable, and writes a contract — field assertions plus hard invariants like 'line items must sum to the total.' We don't assert exact output — that's the whole point with a non-deterministic agent. We assert *properties*."

## 1:45–2:25 — Green run (baseline)

**On screen:** model toggle on **good** → click **Run change**. Feed shows a green `cycle_result — allPassed: true`.

**Narration:**
> "On the current model, every assertion and invariant holds — green. This is our behavioral baseline."

## 2:25–3:25 — Inject the regression (the money shot)

**On screen:** flip toggle to **degraded** → **Run change**. Feed shows assertion failures; the **Drift Classifier** verdict appears: 🔴 **real-regression — invariant violated: sum_line_items_eq_total**. The approval panel appears.

**Narration:**
> "Now I swap to a degraded model — exactly what happens when someone bumps a model version in production. Proctor re-runs, the totals no longer sum, and — this is the key part — the **drift classifier** doesn't just say 'failed.' It reasons: this is a *real regression*, not flaky noise, not legitimate evolution. And notice the run has **paused**."

## 3:25–4:15 — Human-in-the-loop (durability)

**On screen:** point at the pending approval card (verdict + rationale). Click **Approve** (reviewer name). Feed updates: the cycle resumes → resolved `cycle_result` + governance event.

**Narration:**
> "The durable workflow has **suspended on a human-approval hook** — it can wait minutes or days and survive a restart, because the state is persisted. A reviewer — here in our dashboard, in production in **UiPath Action Center** — sees the finding and approves. The workflow *resumes* and records the decision to the governance trail. That's 'keeps humans in charge at key decision points,' running for real."

*(Optional 5s:* mention the *legitimate-evolution* path: "If the output had drifted but was still correct, Proctor would instead propose a contract patch and self-heal after approval — same loop, different verdict.")*

## 4:15–4:45 — UiPath governance plane

**On screen:** show the governance event feed / mention the `UiPathGateway` and `testcloud.ts`.

**Narration:**
> "Everything Proctor decides flows up to UiPath as the governance plane — test results to Test Cloud, the approval task to Action Center, audit events recorded, and Orchestrator can trigger the next run on any model or prompt change. It runs locally today through one adapter and connects to live Test Cloud with a single environment flag."

## 4:45–5:00 — Close

**On screen:** GitHub repo (README + green test badge / `pnpm test` output).

**Narration:**
> "Proctor — regression testing for the age of non-deterministic agents. Built entirely by Claude Code, governed by UiPath, durable by design. Thanks for watching."

---

## Shot checklist
- [ ] Real running app (not slides) — required
- [ ] Architecture walked (two altitudes, agents named) — required
- [ ] Where humans fit (approval pause/resume) — required
- [ ] UiPath platform usage shown/named (Test Cloud, Action Center, Orchestrator)
- [ ] Coding-agent usage called out (Claude Code) — bonus points
- [ ] Under 5:00

## Backup B-roll
If the live app stalls on camera, `pnpm demo` prints the same narrated flow deterministically in the terminal — keep that terminal ready as a fallback.
