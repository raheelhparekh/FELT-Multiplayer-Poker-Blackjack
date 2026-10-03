# Felt — Private Multiplayer Blackjack

> Invite-only, play-money blackjack for a group of friends. No signup required to play.

## Quick start

```bash
# Prerequisites: Node 22+, pnpm 9+
cp .env.example .env         # fill in DATABASE_URL and JWT_SECRET
pnpm install
pnpm dev                     # starts server (3001) + web (5173) in parallel
```

## Run tests

```bash
pnpm test                    # all tests
pnpm --filter @felt/shared test:watch   # watch mode for engine tests
```

## Lint & format

```bash
pnpm lint                    # check
pnpm lint:fix                # auto-fix
```

## Project structure

```
apps/web        React 18 + Vite + Tailwind client
apps/server     Fastify + Socket.IO server
packages/shared Engine, protocol schemas, types, constants
tools/          Dev-only scripts (simulation, headless clients)
docs/           BRIEF.md, DECISIONS.md, PROTOCOL.md, DEPLOY.md
```

## Build phases

See [docs/Brief.md](docs/Brief.md) Section 20.

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Scaffolding, monorepo, tooling |
| 1 | ⬜ Next | Rules engine, tests, simulation |
| 2 | ⬜ | Server, rooms, protocol |
| 3 | ⬜ | Playable client (no polish) |
| 4 | ⬜ | Casino feel: animations + sound |
| 5 | ⬜ | Accounts & session summaries |
| 6 | ⬜ | Deploy & harden |

## Tech stack

TypeScript · React 18 · Vite · Tailwind 3 · Framer Motion · Zustand · Fastify · Socket.IO · Zod · Drizzle ORM · Postgres (Neon) · Vitest · Playwright · Biome
