# AGENTS.md — proctor

## Repo Role

Proctor is a QA agent that regression-tests non-deterministic AI automations
using behavioral contracts and drift classification. It is a public submission
for UiPath AgentHack 2026 (Track 3: UiPath Test Cloud), MIT-licensed, built as
a TypeScript/pnpm monorepo (Next.js dashboard, Vercel Workflow durability,
vitest tests).

## Layout

- `packages/engine/` — contract learner, runner/assertion engine, drift classifier
- `packages/shared/` — shared types and schemas
- `packages/sut-invoice/` — the system-under-test: a deliberately non-deterministic invoice-extraction agent
- `packages/uipath/` — `UiPathGateway` adapters (`LocalGateway` default; `TestCloudGateway` REST stubs)
- `workflows/` — durable Vercel Workflow definitions (pause/resume approval)
- `apps/web/` — Next.js dashboard (`pnpm dev`)
- `scripts/seed-demo.ts` — keyless narrated demo (`pnpm demo`)

## Start Here

- [README.md](README.md) — what it does, quickstart, env vars, UiPath wiring
- [ARCHITECTURE.md](ARCHITECTURE.md) — two-altitude design (UiPath governs, Workflow gives durability)
- [docs/submission/](docs/submission/) — Devpost description and demo script

## Validation

Run from the repo root (Node 20+, pnpm 9.12.0; `pnpm install --frozen-lockfile` first):

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest unit suite
pnpm test:int    # vitest integration suite (pause/resume cycle)
```

Tests and the demo run keyless by default (`PROCTOR_FAKE_LLM=1`,
`PROCTOR_GATEWAY=local`) — no `ANTHROPIC_API_KEY` or UiPath credentials needed.

## Contribution Boundaries

- This is a hackathon submission with a hard deadline (2026-06-29); keep
  changes small, scoped, and demo-safe.
- Do not commit secrets or credentials; the keyless path must keep working
  with no env vars set.
- `packages/uipath/src/testcloud.ts` TODOs are blocked on live UiPath
  credentials — do not invent response shapes for them.
- Keep the UiPath/Proctor boundary intact: UiPath is the control plane,
  Vercel Workflow is the durability layer; neither replaces the other.
