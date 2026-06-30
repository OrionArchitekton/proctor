# Proctor Repo Contract

Date: 2026-06-30

Status: binding repo-local contract.

## Current Name

- `proctor`

## Recommended Name

- `proctor`

## Role

- `hackathon-project`

## Purpose

`proctor` is a Dan personal-brand hackathon project for UiPath AgentHack 2026.
It demonstrates a coded QA agent for non-deterministic AI automations using
behavioral contracts, drift classification, human approval, UiPath gateway
adapters, Vercel Workflow durability, and a Next.js dashboard.

It is not OAC business ownership, estate platform ownership, Orion Runtime
substrate, shared infra, managed deploy-target, or secret-scope ownership.

## Terms

- OAC: Orion Apex Capital, a business-system family outside this repo.
- OIA: Orion Intelligence Agency, a business-system family outside this repo.
- OAM: Orion AI Media, a business-system family outside this repo.
- ATS: Orion Apex trading-system work; not owned by this hackathon project.
- Cosmocrat: governance and policy authority, not execution ownership.
- Orion Runtime: shared execution substrate; not owned by this repo.
- SUT: system under test for Proctor's demo and local test harness.

## Owns

- repo-local TypeScript/pnpm monorepo source for Proctor
- contract learner, assertion engine, runner, drift classifier, and risk scorer
- local and UiPath gateway adapters
- Vercel Workflow durable approval loop and Next.js dashboard
- demo SUT, seed demo, tests, submission docs, deck, and proof artifacts
- keyless local/demo path with `PROCTOR_FAKE_LLM=1` and local gateway behavior

## Does Not Own

- UiPath platform, Test Cloud, Action Center, Orchestrator, or tenant ownership
- OAC, Cosmocrat, OIA, OAM, ATS, ReplyBy, or Auxo business workflows
- estate platform, governance, runtime, shared-infra, or deploy-target status
- live credentials or managed runtime lanes by implication
- production multi-SUT enterprise service ownership outside the hackathon demo

## Allowed Dependencies

- repo-local TypeScript, pnpm, Next.js, Vercel Workflow, Vitest, Zod, Anthropic,
  and UiPath REST adapter dependencies
- UiPath credentials only through explicit env vars for live-gateway exercises
- local disk gateway and keyless deterministic test/demo behavior
- estate doctrine from `orion-estate-audit`
- the personal-brand hackathon and OSS admission note

## Forbidden Logic / Forbidden Ownership

- committing UiPath or Anthropic credentials
- inventing UiPath response shapes where live credentials are required
- replacing UiPath as the governance/control plane or Vercel Workflow as the
  durability layer by implication
- adding managed deploy, scheduled job, or secret scope without separate admission
- turning the hackathon demo into business, platform, runtime, or shared-infra
  ownership

## PR Reject Rules

- reject PRs that break the keyless demo, test, or local gateway path
- reject PRs that commit secrets or require credentials for default tests
- reject PRs that blur the UiPath/Proctor boundary
- reject PRs that expand this repo into business, platform, runtime,
  shared-infra, deploy-target, or secret-scope ownership
- reject PRs that fabricate live UiPath behavior without real evidence

## Verification

For docs-only contract changes:

```bash
git diff --check
```

For implementation changes, follow `AGENTS.md`: run `pnpm typecheck`, `pnpm
test`, and `pnpm test:int` after installing with the frozen lockfile.

## Enforcement

- Repo-local review applies the PR reject rules in this file.
- Docs-only changes must pass `git diff --check`.
- Implementation changes must pass the `AGENTS.md` pnpm verification stack.
- Estate-level indexing is enforced by
  `scripts/validate_repo_contract_registry.py` in `orion-estate-audit`.
- Future automation that changes secret handling, keyless demo behavior, or
  ownership boundaries must point its checks back to this contract.

## Basis

- `AGENTS.md`
- `README.md`
- `ARCHITECTURE.md`
- `docs/submission/DEVPOST.md`
- `docs/submission/DEMO_SCRIPT.md`
- `docs/submission/DECK.md`
- `repos/repo_contract_registry_20260317.csv` in `orion-estate-audit`:
  <https://github.com/OrionArchitekton/orion-estate-audit/blob/8773013a0d3ae2230641ee76e6d8b99a62a5cfc2/repos/repo_contract_registry_20260317.csv>
- `architecture/repo_contracts/dan_mercede_personal_brand_repo_contract_20260318.md`
  in `orion-estate-audit`:
  <https://github.com/OrionArchitekton/orion-estate-audit/blob/8773013a0d3ae2230641ee76e6d8b99a62a5cfc2/architecture/repo_contracts/dan_mercede_personal_brand_repo_contract_20260318.md>
- `architecture/PERSONAL_BRAND_HACKATHON_AND_OSS_PROJECT_ADMISSION_NOTE_20260621.md`
  in `orion-estate-audit`:
  <https://github.com/OrionArchitekton/orion-estate-audit/blob/8773013a0d3ae2230641ee76e6d8b99a62a5cfc2/architecture/PERSONAL_BRAND_HACKATHON_AND_OSS_PROJECT_ADMISSION_NOTE_20260621.md>
