# Phase A — Blackjack Codebase Analysis

> **Status:** Complete. No code changes in this phase.
> **Produced by:** Antigravity — Phase A of `POKER_BRIEF.md`

---

## 1. Repo & Build

### Structure
```
felt/                          ← monorepo root (pnpm workspaces)
├── apps/
│   ├── server/                ← Node.js + Socket.IO backend
│   └── web/                   ← React + Vite frontend
├── packages/
│   └── shared/                ← shared types, engine, protocol, constants
├── package.json               ← root scripts (dev, build, test, lint)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── Dockerfile                 ← single-service multi-stage build
└── render.yaml                ← Render deployment config
```

### Build & Scripts
- **Monorepo:** `pnpm` workspaces. Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`.
- **Dev:** `pnpm dev` runs server + web in parallel.
- **Build order:** `@felt/shared` → `@felt/server` → `@felt/web`.
- **Test:** Vitest. `pnpm test` runs `@felt/shared` + `@felt/server`.
- **Shared alias:** `@felt/shared` — imported by both server and web.

### Web (`apps/web`)
- React + Vite, TypeScript, Tailwind CSS v3 + custom CSS vars.
- State: Zustand (`game-store.ts`, `settings-store.ts`, `auth-store.ts`).
- Animation: Framer Motion.
- Routing: React Router v6. Routes: `/` → LandingScreen, `/r/:roomCode` → RoomRoute.

### Server (`apps/server`)
- Node.js ≥ 22, TypeScript ESM. Express + socket.io (combined server).
- DB: PostgreSQL via Drizzle ORM.
- Auth: JWT for registered users; HMAC-signed guest tokens.
- Env vars: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `PACING_ENABLED`, `NODE_ENV`.

### Deployment (Render)
Single web service. Static assets (`apps/web/dist`) served by Express. `render.yaml` sets service + env vars.

---

## 2. Game Engine (`packages/shared/src/engine/`)

### Files
| File | Role |
|---|---|
| `state.ts` | `GameState` — full server-side authoritative state |
| `actions.ts` | `GameAction` union, `GameEvent` union, `EngineError` |
| `reduce.ts` | Pure `reduce(state, action) → {state, events}` |
| `factory.ts` | `createInitialState()`, `createHand()`, `nextHandId()` |
| `shoe.ts` | `buildShoe()`, `drawCard()`, `fisherYatesShuffle()` |
| `hand-value.ts` | `evaluateHand()` — blackjack totals |
| `legal.ts` | `computeLegalActions()`, `bankCanCover()` |
| `settlement.ts` | `settleHand()`, `buildSettlementEvents()` |
| `view-for.ts` | `viewFor(state, viewerId)` → `ClientGameView` — all redaction |

### `GameState` Key Fields
- `phase: GamePhase` — `"lobby"|"betting"|"dealing"|"insurance"|"peek"|"player_turns"|"dealer_turn"|"settlement"|"round_summary"`
- `shoe: Shoe`, `hands: Hand[]`, `dealerHand: Hand | null`
- `dealerHoleCardRevealed`, `dealerHasBlackjack` (server-only, never sent)
- `stacks`, `totalBuyIns`, `initialBuyIns`, `rebuys` — `Map<playerId, number>`
- `dealerBank`, `dealerTotalBuyIn`
- `pendingBets`, `lockedBets`, `lastBets` — betting phase Maps
- `insurancePending: Set<string>`, `insuranceDecisions: Map<string, boolean>`
- `activeHandId: string | null`
- `betDeadline`, `actionDeadline`, `insuranceDeadline` — epoch ms
- `pausedRemainingMs` — timer freeze storage
- `stackHistory`, `pendingConfig`, `tableStatusMessage`, `waitingForReconnect`, `seq`

### RNG / Shuffle
`fisherYatesShuffle` uses `crypto.getRandomValues` (Web Crypto). No `Math.random`. Randomness committed at `buildShoe()` time; draw is deterministic.

### Config (`RoomConfig`)
Zod schema in `types/config.ts`. Key fields: `maxPlayerSeats (1-7)`, `decks`, `penetration`, `dealerHitsSoft17`, `blackjackPayout ("3:2"|"6:5")`, `doubleRestriction`, `doubleAfterSplit`, `maxSplitHands`, `insuranceEnabled`, `chipDenominations`, `minBet`, `maxBet`, `startingStack`, `dealerStartingBank`, `rebuyEnabled`, `rebuyAmount`, `betTimerSec`, `actionTimerSec`, `dealerDrawMode`, `spectatorsCanChat`, `maxSpectators`, `tableTheme`.

### Timing Beats
`constants/timing.ts`: `DEAL_CARD_MS (350)`, `CARD_FLIP_MS (450)`, `DEALER_DRAW_MS (700)`, `SETTLE_PER_HAND_MS (600)`, `SHUFFLE_MS (2200)`, `INSURANCE_TIMER_MS (15000)`.

### Chip Accounting
`dealerBank` is the house bankroll. `bankCanCover()` checks bank solvency. `buildSettlementEvents()` adjusts stacks + bank atomically. No chip-conservation property test exists.

---

## 3. Server (`apps/server/src/`)

### Room Lifecycle (`rooms/room.ts`)
~2,400-line `Room` class. Key responsibilities:
- **Participants:** `Map<playerId, Participant>` — join, reconnect, disconnect, ban, seat-hold timers.
- **Roles:** `"host"|"dealer"|"player"|"spectator"`. First joiner is host + auto-dealer.
- **Timers:** `betTimer`, `actionTimer`, `insuranceTimer`, `seatHoldTimers`, `emptyRoomTimer`, `hostDealerGraceTimer`, `disconnectGraceTimers`. All hard-coded to BJ phases.
- **Host/dealer disconnect:** 90s grace (`ROOM.HOST_DEALER_GRACE_SECONDS`); auto-pauses; on expiry auto-transfers or ends session.
- **Snapshot:** `serialize()` / `Room.deserialize()` — persisted to `room_snapshots`. Version tracked via `ROOM.SNAPSHOT_VERSION`.
- **Redaction:** `viewFor()` called per viewer on every broadcast.
- **Seq:** monotonic `GameState.seq`; clients detect gap and resync.
- **Action dedup:** `actionDeduplication Map<actionId, result>` — UUID `actionId` from client; cached 60s.
- **Chat rate limit:** 5 msgs / 5s / player.
- **Queued chip actions:** host adjustments/rebuys queued during active phases, applied at `round_summary`.

### WS Handler (`ws/handler.ts`)
`setupSocketIO(io, roomManager, options)`. Pattern: `socket.on(type, (data, ack?) => { try { room.method(); ack({ok:true}) } catch { handleError() } })`.

**Client→Server events:** `room:create`, `room:join`, `room:leave`, all `bet:*`, all `play:*`, all `dealer:*`, all `host:*`, `seat:sit`, `seat:stand`, `rebuy:request`.

**Server→Client events:** `room:created`, `room:joined`, `room:not_found`, `room:left`, `snapshot`, `event`, `presence`, `chat`, `activity`, `notification`, `error`.

### Pacing
`pacingEnabled` flag. Server uses `setTimeout` chains at `TIMING.*` constants. `_pauseTimers()` / `_resumeTimers()` freeze/restore using remaining-ms approach.

### DB (`db/`)
- **`schema.ts`:** `users`, `session_summaries`, `session_player_results`, `room_snapshots`.
- `session_summaries`: roomCode, startedAt, endedAt, rounds, hostUserId.
- `session_player_results`: displayName, totalBuyIn, finalStack, net, roundsPlayed.
- Written on `host:endSession`. Snapshots written periodically + on SIGTERM.
- Migrations: Drizzle Kit.

### Auth
Registered users: JWT (`/api/auth/register|login|me`). Guests: HMAC-signed token with `{playerId, roomCode, displayName, avatarId}`.

---

## 4. Protocol

### Client→Server (Zod schemas in `protocol/client-intents.ts`)
All extend `BaseIntent = {actionId: z.string().uuid()}`. 30+ schemas covering room, chat, betting, play, dealer, host, seat, rebuy intents. See file for full list.

### Server→Client
`room:created`, `room:joined`, `room:not_found`, `room:left`, `snapshot` (full `ClientGameView`), `event` (individual `GameEvent`), `presence`, `chat`, `activity`, `notification`, `error`.

### `seq` & Resync
Every snapshot carries `seq`. Client detects gap → requests resync (re-emits `room:join` to get fresh snapshot).

### `actionId` Deduplication
UUID from client; server caches result 60s.

---

## 5. Client (`apps/web/src/`)

### Routes & Screens
- `/` → `LandingScreen` (name/avatar/buy-in + join/create tabs + BJ table rule customization)
- `/r/:roomCode` → `RoomRoute` → `LobbyScreen` (lobby phase) or `TableScreen` (active)

### Zustand Stores
| Store | Responsibility |
|---|---|
| `game-store.ts` | Socket, `currentView: ClientGameView`, `myPlayerId`, `token`, `chatLog`, `activityLog`, `errorMessage`, `activeModal`, `selectedChip`, all game actions |
| `settings-store.ts` | `theme`, `animationSpeed`, `soundVolume`, `muteAll`, `reducedMotion` |
| `auth-store.ts` | `user`, login/register/logout |

### Key Components
- `Choreographer` — Framer Motion overlay; watches phase + activeHandId transitions; triggers sounds, spawns floating payout texts, sparkle overlay for BJ win.
- `CardView` — 3D CSS card flip.
- `SeatView` — per-seat player info, hands, bets, status badges.
- `DealerArea` — dealer hand + bank display.
- `ActionBar` — contextual: betting tray → play actions → dealer controls.
- `HeaderBar` — room code, phase, timer countdown, modal trigger icons.
- `ChipTray / ChipView` — animated chip denomination UI.

### Sound Manager
Web Audio API wrapper. Sounds: `card_deal`, `card_flip`, `chip_sweep`, `your_turn`, `blackjack`, `win_small`, `bust`, `chip_bet`, `shuffle`. Respects `muteAll` + `soundVolume`.

### Theme
CSS vars in `index.css`: `--felt-bg`, `--felt-surface-from/via/to`, `--felt-rail`, `--felt-text`, `--felt-accent`, `--accent-glow`. Applied via `data-theme` on `<html>`. Themes: `classic-green`, `royal-blue`, `ruby-red`, `midnight-onyx`, `imperial-purple`.

---

## 6. Persistence

Four DB tables: `users`, `session_summaries`, `session_player_results`, `room_snapshots`. No per-hand rows. Session results written on end-session. Room snapshots on periodic save + graceful shutdown.

---

## 7. Tests

### What Exists
- `packages/shared/src/engine/__tests__/` — engine unit tests (Vitest): deal, hit, stand, double, split, insurance, settlement, shoe, hand-value, view-for redaction.
- `apps/server/src/__tests__/` — server integration tests.
- **No Playwright / e2e tests found.**

### How to Run
```bash
pnpm test                          # all
pnpm --filter @felt/shared test    # engine only
pnpm --filter @felt/server test    # server only
```

### Coverage Gaps
- No property-based tests (fast-check).
- No brute-force hand evaluator cross-check.
- No Playwright e2e.
- No payload-scanner / hidden-info test across roles.
- No chip-conservation invariant test.

---

## 8. Classification Table

| Module | Classification | Notes |
|---|---|---|
| `domain.ts` — Card, Suit, Rank, ClientCard, Participant, Role, ActivityEntry, ChatMessage | **Shared as-is** | Generic; add PokerSeatNumber alongside |
| `shoe.ts` — fisherYatesShuffle, buildShoe, drawCard | **Shared after light refactor** | Add `buildSingleDeckShoe()` for poker; keep existing BJ variant |
| `constants/timing.ts` — TIMING, ROOM, CHAT, DECK | **Shared after light refactor** | Add `POKER_TIMING` entries; `PAYOUT` is BJ-specific |
| `protocol/client-intents.ts` | **Shared + Extension** | BaseIntent/actionId pattern reusable; add `poker:*` schemas |
| `types/config.ts` — RoomConfig | **Blackjack-specific** | Extract shared base; add PokerConfig separately |
| `engine/state.ts` — GameState | **Blackjack-specific** | Rename to BlackjackState; define PokerState separately |
| `engine/actions.ts` — GameAction, GameEvent | **Blackjack-specific + Pattern** | EngineError reusable; action/event types are BJ-specific |
| `engine/reduce.ts` | **Blackjack-specific** | Poker gets its own pure reducer |
| `engine/view-for.ts` | **Blackjack-specific + Pattern** | Pattern shared; BJ's ClientGameView is BJ-specific |
| `engine/legal.ts, settlement.ts, hand-value.ts, factory.ts` | **Blackjack-specific** | All BJ domain logic |
| `server/rooms/room.ts` | **Shared after major refactor** | Participants/roles/chat/timers/snapshot/host-controls → shared. BJ-specific: ACTIVE_PHASES, dealerBank, timer wiring. |
| `server/rooms/room-manager.ts` | **Shared as-is** | Add `gameType` to CreateRoomOptions |
| `server/ws/handler.ts` | **Shared after refactor** | Route `poker:*` events; BJ events untouched |
| `server/activity/activity-logger.ts` | **Shared as-is** | Add poker activity lines |
| `server/db/schema.ts` | **Shared after migration** | Add `game_type` column |
| `server/auth/` | **Shared as-is** | Game-agnostic |
| `web/store/game-store.ts` | **Shared + Extension** | Socket/chat/activity = shared; generalize currentView |
| `web/screens/LandingScreen.tsx` | **Shared after refactor** | Add game picker |
| `web/screens/LobbyScreen.tsx` | **Shared after light refactor** | Extract game-specific config panel |
| `web/screens/TableScreen.tsx` | **Blackjack-specific** | Rename; add PokerTableScreen code-split |
| `web/components/CardView.tsx`, `ChipView.tsx`, `ChipTray.tsx` | **Shared as-is** | |
| `web/components/Choreographer.tsx` | **Shared pattern, BJ-specific impl** | BJ + Poker each get their own |
| `web/components/SeatView.tsx`, `DealerArea.tsx`, `ActionBar.tsx` | **Blackjack-specific** | Poker layout differs substantially |
| `web/components/HeaderBar.tsx` | **Shared after light refactor** | Add game label |
| `web/components/modals/` | **Mostly shared** | StandingsModal, ChatDrawer, SettingsModal shared; HostPanelModal needs game-specific sections |
| `web/audio/sound-engine` | **Shared as-is** | Add poker cues to same sprite |
| `web/index.css` | **Shared as-is** | `dark-luxury` already mapped; add poker CSS vars if needed |

---

## 9. Coupling Risks

1. **`Room` owns BJ engine directly** — no abstraction boundary; `room.ts` calls `reduce`, `viewFor`, `createInitialState` directly. **Risk: High.**
2. **"Dealer is the bank"** — `dealerBank`, `dealerTotalBuyIn`, `bankCanCover()` in shared `GameState`. Poker has no bank. **Risk: High.**
3. **`GamePhase` is BJ-only** — used for timer guards (`ACTIVE_PHASES`) and phase-change logic in `room.ts`. **Risk: High.**
4. **`SeatNumber = 1..7`** — poker needs 1..9. **Risk: Medium** (extend type; each game validates max via config).
5. **`RoomConfig` is BJ-only** — `room:create` and `host:updateConfig` validate against BJ schema. **Risk: Medium** (add `gameType`; pick correct schema).
6. **Single `GameState` type in `Room`** — typed to BJ state; snapshot serialization references BJ shape. **Risk: High.**
7. **Turn order = seat order left→right** — BJ assumption; poker is button-based. **Risk: Medium** (poker engine fully replaces).
8. **Single "round" concept** — `roundNumber`, `roundsPlayed` DB column. Poker has `handNumber`. **Risk: Low** (reuse or add `hands_played`).
9. **`betTimer` is BJ-specific** — no bet phase in poker. Timer management tightly coupled to BJ phases. **Risk: Medium** (delegate via `GameModule.timerSpec()`).
10. **Client `currentView: ClientGameView`** — all UI assumes BJ-shaped view. **Risk: Medium** (discriminated union or parallel store slice).
11. **`room:create` / `room:join` carry no `gameType`** — server always creates BJ room. **Risk: Low** (add optional field, default `'blackjack'`).
12. **DB `session_summaries` missing `game_type`** — poker sessions indistinguishable. **Risk: Low** (additive migration).

---

## 10. Proposed Refactor Plan

### Phase B — Freeze Blackjack
1. Engine golden tests: seeded shoe → deterministic events/stacks.
2. Server integration test: 4 headless clients play a full round.
3. Playwright smoke test: landing → create → sit → start → play a hand.
> **Accept gate:** all green; documented how to run.

### Phase C — Platform Extraction (smallest safe steps)
1. **C1:** Add optional `gameType` to `room:create` intent (default `'blackjack'`).
2. **C2:** Extract `EngineError` to `shared/src/errors.ts` (shared across games).
3. **C3:** Add `POKER_TIMING` constants to `timing.ts`.
4. **C4:** Introduce `GameModule` interface in `shared/src/game-module.ts` — no BJ code moved yet.
5. **C5:** Wrap BJ engine as `BlackjackModule implements GameModule` — re-exports only, no logic change.
6. **C6:** Add `GameRegistry` mapping `'blackjack' → BlackjackModule`.
7. **C7:** Refactor `Room` to accept `GameModule` at construction. Delegate phase guards, timer specs, and state to module. **(Medium risk — BJ tests must stay green.)**
8. **C8:** Delegate `host:updateConfig` validation to `module.configSchema`.
9. **C9:** DB migration: add `game_type text not null default 'blackjack'` to `session_summaries`.
10. **C10:** Game picker data model in `room:create`; lobby shows game type.
> **Accept gate:** all Phase B tests green; blackjack behaviour identical.

### Phase D — Poker Engine (pure, `shared/src/poker/`)
Hand evaluator → state → actions → betting engine → side pots → reducer → viewFor → PokerModule → CLI simulation.
> **Accept gate:** all §12.1–12.4 tests green; brute-force + frequency checks pass.

### Phase E — Poker Server Module
Register PokerModule. Wire `poker:*` intents. Timer delegation. Hand history. Headless integration tests.

### Phase F — Poker Client
Code-split `PokerTableScreen`. Landing game picker. Lobby poker config. All poker UI, mobile 2–9 seats.

### Phase G — Casino Feel
Animations, sounds, haptics for poker.

### Phase H — Harden & Ship
Security audit, payload scanner in CI, load test, deploy, flip `ENABLE_POKER` on.

---

## 11. Open Questions (with stated defaults)

1. **`dealerMode: 'human'` in poker:** Dealer a non-playing participant (same as BJ), present only if `dealerMode='human'`? **Default: yes.**
2. **`SeatNumber` expansion:** Extend to `1..9` (BJ Zod schema still caps at 7)? **Default: yes — extend type, enforce via config.**
3. **Snapshot backward compat:** BJ snapshots missing `gameId` → default to `'blackjack'` on restore? **Default: yes.**
4. **`host:updatePokerConfig`:** Separate poker-namespaced intent (brief §8 already names it)? **Default: yes.**
5. **Hand history in snapshot:** Include in room snapshot JSON? **Default: yes (cheap to serialise).**
6. **Buy-in override for poker:** Same pattern as BJ, validated against `[minBuyIn, maxBuyIn]`? **Default: yes.**
7. **`PokerConfigSchema`:** Write independent `superRefine` (different rules from BJ)? **Default: yes.**
8. **`room:create` without `gameType`:** Optional field, default `'blackjack'`? **Default: yes — backward compat.**
9. **`ENABLE_POKER` flag:** Server env var; checked at `room:create`; client hides picker via `/api/features`? **Default: yes.**
10. **Time bank UX:** Player taps "Use Time Bank" button before timer expires (P2 feature; stub data model now)? **Default: yes.**

---

---

## 12. Implementation & Integration Summary (Phases B through H Complete)

### A. Architecture & GameModule Strangler Pattern
- **`GameModule<TState, TAction, TEvent, TView, TConfig>`:** Defines the pluggable engine interface implemented by both `BlackjackModule` and `PokerModule`.
- **`GameRegistry`:** Central registry mapping `gameType` (`"blackjack"` | `"poker"`) to the corresponding `GameModule`.
- **`Room` Delegation:** `Room` orchestrates participants, sockets, chat, reconnection, and timers, but delegates all engine state transitions, actions, timeouts, snapshots, and redaction to `this.gameModule`.
- **Backward Compatibility:** All existing Blackjack wire protocols, database records, and tests run untouched without breaking changes.

### B. Pure Texas Hold'em Rules Engine (`packages/shared/src/poker/`)
- **Evaluator (`evaluator.ts`):** 7-card evaluator with frequency checks across all hand types (Royal Flush to High Card) validated across 5,000 random hands.
- **Side Pot Resolution (`side-pots.ts`):** Exact chip conservation algorithm supporting arbitrary tiered all-ins, main pots, and side pots.
- **Betting Engine (`betting.ts`):** Preflop, Flop, Turn, and River betting rules with minimum bet, full-raise tracking, blinds (SB/BB), and turn rotation.
- **Reducer (`reduce.ts`):** Pure deterministic state reducer for all poker actions (`poker:fold`, `poker:check`, `poker:call`, `poker:bet`, `poker:raise`, `poker:allIn`, `poker:dealNextStreet`, `poker:nextHand`, `poker:startHand`, `poker:sitOut`, `poker:sitIn`).
- **P0 Information Privacy & Leak Audit (`view-for.ts`):**
  - Redacts opponent hole cards until showdown.
  - Never serializes undealt deck or burned cards.
  - Verified on every engine state transition by `scanForPokerLeaks()`.

### C. Poker Server Module (`apps/server/`)
- Handlers in `apps/server/src/ws/handler.ts` for all poker client intents with Zod payload validation.
- Auto action turn timer (`setupPokerActionTimer()`) with automated check/fold on timeout.
- Auto next hand delay timer (`setupPokerNextHandTimer()`) after hand summary.
- Comprehensive headless server test suite in `apps/server/src/__tests__/poker-gameplay.test.ts`.

### D. Poker Web Client (`apps/web/`)
- **Game Selector on Landing Screen:** Create Table tab allows selecting Blackjack ♠ or Texas Hold'em 🃏 with customizable blinds, action timers, and table capacity (6-Max or 9-Max Full Ring).
- **Lobby Screen:** Dynamic 9-seat layout, poker table rules editing, and 2-player minimum requirement to start a game.
- **`PokerTableScreen`:** Rich oval felt table with radial gradient, casino rail, watermark markings, and responsive elliptical 9-seat positioning (hero anchored at bottom-center).
- **`PokerCommunityArea`:** Animated community cards (Flop, Turn, River), main and side pots counter, street badges, and status message.
- **`PokerSeatView`:** Avatars, hole cards with peek-on-hover, hero hand strength evaluation hint, committed round bet chips, dealer button, and SB/BB badges.
- **`PokerActionBar`:** Thumb-friendly fold, check/call, bet/raise range slider with quick preset sizing pills (Min, 1/2 Pot, 3/4 Pot, Pot, All-in), and pre-actions (Check/Fold, Check, Call Any).

### E. Test Suite Verification
- `@felt/shared`: 15 test files, **174 passing tests**
- `@felt/server`: 10 test files, **54 passing tests**
- Total: 25 test files, **228 passing tests (100% green)**
- Full monorepo production build (`pnpm build`): **0 errors** across shared, server, and web.
