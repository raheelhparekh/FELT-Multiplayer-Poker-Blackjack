# MASTER PROMPT — Private Multiplayer Blackjack ("FELT", working title)

> Paste this whole file into Claude Code / Antigravity as the project brief. Save it in the repo as `docs/BRIEF.md` and keep it updated. Work phase by phase (Section 20). Do not skip ahead.

---

## 0. How you (the coding agent) must work

You are a senior full-stack engineer (20+ years) building this for a private friend group. Follow these rules:

1. **Work in phases** (Section 20). Finish a phase, run its tests, show me what to try, then stop and wait for my go-ahead.
2. **Rules before pixels.** The blackjack engine is built and tested before any UI.
3. **Ask before deviating** from a fixed decision in Section 2. If you believe a decision is wrong, explain why in 3 lines and ask.
4. **No hidden-information leaks, ever** (Section 9). A leak is a P0 bug.
5. **No bots or AI players in the product.** Scripted headless test clients are allowed *only* under `/tools` or `/tests` for automated testing and are never exposed in the UI.
6. **Small, reviewable commits** with clear messages. Keep `README.md` current (run, test, deploy).
7. **Everything configurable lives in one typed `RoomConfig`** (Section 4.2). No magic numbers scattered in code.
8. If a requirement is ambiguous, pick the safest default, write it in `docs/DECISIONS.md`, and keep going. Only stop to ask for things that block progress.

---

## 1. Product vision

A **private, invite-only, online blackjack table** for a group of friends playing from their homes, each on their own phone or laptop. It must feel like a **real casino table**: green felt / dark-luxury look, real-feeling cards and chips, polished animation, satisfying sound, and live chat.

- A **host** creates a room and shares a **room code or link**.
- The host assigns one friend as **Dealer** (a human) and the rest as **Players** (up to 7 seats). Others can **spectate**.
- Players play on their own screens; everything is **live**.
- Inspiration for the UX: **rentnationgg.com**, a no-signup, private-room-with-code multiplayer board game with a polished visual board and an activity feed. We want that kind of friction-free "share a code and play" feel, applied to blackjack.

**Play money only. No real money, payments, or gambling features.**

### Non-goals (do not build)
Real-money anything; public matchmaking/lobbies; bots; voice/video; native apps; tournaments; side bets (backlog only); horizontal scaling.

---

## 2. Fixed technical decisions

| Area | Decision |
|---|---|
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces: `apps/web`, `apps/server`, `packages/shared` |
| Frontend | React 18 + Vite + Tailwind CSS + Framer Motion (`motion`), Zustand, React Router |
| Table rendering | DOM + CSS 3D transforms for a 2.5D table (`perspective`, slight `rotateX`). Animate only `transform`/`opacity`. Canvas overlay only if later needed for particles. |
| Sound | Howler.js, audio sprites |
| Server | Node 22 + Fastify + Socket.IO |
| Validation | Zod schemas in `packages/shared`, used by both client and server |
| Game logic | Pure reducer in `packages/shared/engine`: `reduce(state, action) -> { state, events }`; no timers/IO/randomness inside |
| RNG | `crypto.randomInt` Fisher–Yates; never `Math.random` |
| DB | Postgres (Neon) + Drizzle ORM. Minimal use (Section 11). Local dev uses Docker Postgres or SQLite via the same Drizzle schema abstraction if easy; otherwise Docker. |
| Auth | Optional. Guests = signed token in localStorage. Registered = email + password (argon2id) + JWT in an httpOnly cookie. |
| Tests | Vitest (unit/property, `fast-check`), Playwright (multi-player e2e) |
| Lint/format | ESLint + Prettier (or Biome) |
| Hosting | Single Node service serves static SPA + WebSocket (Fly.io / Railway / Render). Single instance. |
| Mobile | **Mobile-first**, portrait primary, landscape and desktop supported. PWA manifest. |

---

## 3. Repository layout

```
/apps/web            React client
/apps/server         Fastify + Socket.IO server, Room manager, auth, DB
/packages/shared     engine/, protocol/ (zod), types/, constants/
/tools               dev-only scripted test clients, simulation scripts
/docs                BRIEF.md, DECISIONS.md, PROTOCOL.md
CREDITS.md           audio/art attributions
```

---

## 4. Blackjack rules specification

### 4.1 Core rules (defaults)
- **Shoe:** 6 decks, shuffled with a **cut card at ~75% penetration**. When the cut card is reached, finish the current round, then reshuffle (with a shuffle animation + sound) before the next one.
- **Card values:** 2–10 face value; J/Q/K = 10; Ace = 1 or 11 (best non-busting value). Track *soft* vs *hard* totals.
- **Blackjack ("natural"):** Ace + 10-value on the **first two cards of an unsplit hand**. Pays **3:2**. A 21 made after a split is **not** a blackjack (pays 1:1).
- **Dealer:** gets one up card and one hole card. **Dealer stands on all 17s (S17)** (soft 17 included) and must draw on 16 or less.
- **Dealer peek:** if the up-card is an Ace or any 10-value card, the **server** checks the hole card for blackjack after the insurance step. If dealer has blackjack, the round ends immediately: players with blackjack push, everyone else loses (insurance pays 2:1). The peek is server-side only; **no client, including the dealer's, sees the hole card**.
- **Player actions:**
  - **Hit**
  - **Stand**
  - **Double Down:** allowed on any first two cards (host option: restrict to totals of 9–11). Exactly one more card, then the hand stands. Requires an additional stake equal to the original bet.
  - **Split:** two cards of the same *value* (host option: same *rank* only). Up to **4 hands total** (3 splits). **Double after split: allowed.** **Split aces: one card each, no resplit, no further hits.** Each split hand needs a bet equal to the original.
  - **Insurance:** offered only when the dealer's up-card is an Ace. Costs up to **half the original bet**; pays **2:1** if the dealer has blackjack. (Treat "even money" on a player blackjack as taking insurance.)
  - *Surrender: not in v1 (backlog).*
- **Auto-actions:** a hand at 21 stands automatically. A busted hand loses immediately.
- **Dealer draws:** if every player hand is busted (or blackjack-resolved), the dealer reveals the hole card but draws no further cards.
- **Settlement:** win = 1:1; blackjack = 3:2; push = bet returned; loss = bet goes to the bank; insurance = 2:1 or lost.
- **Chips are integers.** If a payout is ever fractional, **round down in favour of the house** and log it. (With the default denominations this never occurs.)

### 4.2 `RoomConfig` (host-editable between rounds; changes mid-round queue until the round ends)

```ts
RoomConfig = {
  maxPlayerSeats: 1..7            // default 7
  decks: 1|2|4|6|8                // default 6
  penetration: 0.5..0.9           // default 0.75
  dealerHitsSoft17: boolean       // default false (S17)
  blackjackPayout: '3:2'|'6:5'    // default '3:2'
  doubleRestriction: 'any'|'9-11' // default 'any'
  doubleAfterSplit: boolean       // default true
  maxSplitHands: 2..4             // default 4
  splitBy: 'value'|'rank'         // default 'value'
  resplitAces: boolean            // default false
  insuranceEnabled: boolean       // default true
  chipDenominations: number[]     // default [50,100,200,500,1000]
  minBet: number                  // default 50
  maxBet: number                  // default 1000
  startingStack: number           // default 5000 (per player, individually overridable by host)
  dealerStartingBank: number      // default 50000
  rebuyEnabled: boolean           // default true
  rebuyAmount: number             // default 5000
  rebuyRequiresHostApproval: boolean // default false
  betTimerSec: number|null        // default 30
  actionTimerSec: number|null     // default 30  (on expiry: auto-STAND, never auto-hit)
  dealerDrawMode: 'auto'|'manual' // default 'auto' (manual = dealer clicks per card)
  spectatorsCanChat: boolean      // default true
  maxSpectators: number           // default 8
}
```

Validate with Zod; reject impossible combinations (e.g., `minBet > maxBet`, a denomination smaller than `minBet`).

---

## 5. Roles & permissions

| Role | Can do |
|---|---|
| **Host** (creator; transferable) | Everything below + assign/replace Dealer, assign seats, kick, edit `RoomConfig`, **adjust any stack or the dealer bank**, approve rebuys, pause/resume, end session, transfer host |
| **Dealer** (human, one at a time) | Click **Deal**, **Reveal / Play dealer hand**, **Next round**, (manual mode) **Draw next card**, **Shuffle now** (between rounds). Dealer **cannot** deviate from rules: the server enforces all rules and never exposes the hole card. |
| **Player** (seats 1–7) | Place/undo/lock bets, Hit/Stand/Double/Split/Insurance on their own turn, request rebuy, chat |
| **Spectator** | Watch live, chat (if enabled), request to sit when a seat is free |

- Host may also be the Dealer or a Player. The Dealer is **not** a player (the dealer is the bank).
- The host can change the Dealer **only between rounds**. The old dealer's bank value is handed to the new dealer, or the host sets a new bank; either way it's logged.
- If the host disconnects or leaves, auto-transfer host to the longest-seated connected user (announce it).
- **Kicked users** are blocked from that room (token-based ban); their chips are removed from the table and logged.

---

## 6. Chips & bankroll

- Each player has a **stack**. `totalBuyIn` accumulates starting stack + rebuys + host top-ups. **Session net = stack − totalBuyIn**. This is the number friends care about.
- The **dealer has a bank** (limited). It can go broke.
- **Host chip controls** (any time between rounds; a mid-round request queues): `set`, `add`, `subtract` for any player or the dealer bank. Every adjustment is **posted to the public activity log** ("Host added 2,000 to Priya") so nothing is secret.
- **Rebuy:** a player at 0 (or below `minBet`) can request a rebuy **between rounds**. Auto-granted or host-approved per config. Rebuy increases `totalBuyIn`.
- **Bank liability invariant:** `sum(max liability of all active hands + insurance) ≤ dealer bank` at all times.
  - Max liability per hand = 1× bet (win); 1.5× (blackjack); 2× (doubled); insurance = 2× insurance stake.
  - Enforce at **bet time** (a player's max bet is capped by `floor(bank ÷ seated players)` snapped down to a valid chip combination) and again before **double / split / insurance**. If the bank can't cover, disable that action with the reason "Bank can't cover this".
  - If `bank < minBet`, the round cannot start; show the host/dealer a prompt to top up or reassign.
- **Chip conservation property:** total chips (all stacks + bank + chips in play) changes **only** via buy-in / rebuy / host adjustment. Add property tests (Section 18).

---

## 7. Game state machine and flow

```
LOBBY → BETTING → DEALING → [INSURANCE] → [PEEK] → PLAYER_TURNS → DEALER_TURN → SETTLEMENT → ROUND_SUMMARY → BETTING …
                                   (paused / session-ended overlay at any boundary)
```

1. **LOBBY:** host sets roles/seats and rules; room code/link shown; Start Session when a dealer + ≥1 player are seated.
2. **BETTING:** all seated players place bets simultaneously. UI: tap chips to add, **Undo**, **Clear**, **Repeat last bet**, **Lock bet**. A bet timer shows if enabled. Players who haven't bet by the deadline **sit out** this round. The Dealer's **Deal** button enables when ≥1 bet is locked (the dealer may deal early once all seated players are locked or sitting out, or at timer end).
3. **DEALING:** the dealer clicks **Deal**. The server deals: one card each left→right, dealer up-card, second card each, dealer hole card (face-down). Paced by server "beats" (Section 8.4).
4. **INSURANCE:** only if dealer's up-card is an Ace and the config enables it. Each eligible player decides (Yes/No) within a short timer (default 15s).
5. **PEEK:** if up-card is A or 10-value, the server peeks. If dealer blackjack → straight to SETTLEMENT.
6. **PLAYER_TURNS:** seats act **left→right**, one hand at a time, with a clear turn indicator and the action timer. Split hands are played in order. Illegal actions are rejected server-side, and the UI only shows legal actions.
7. **DEALER_TURN:** the dealer clicks **Reveal**. The server flips the hole card, then draws per the rules (auto with beats, or manual per-card clicks).
8. **SETTLEMENT:** the server computes outcomes. Animations: winning chips slide from the bank to players; losing chips are swept to the bank; pushes return. Numbers count up/down.
9. **ROUND_SUMMARY:** the standings panel (Section 16) shows. The dealer clicks **Next round** (or the host can). Between rounds, the host can adjust chips/rules and rebuys can happen.

**Pause:** the host can pause (timers freeze, overlay shown). **End session:** shows the final standings and writes the summary (Section 11).

---

## 8. Server architecture & protocol

### 8.1 Authority
The server is the single source of truth. Clients send **intents**; the server validates (role, phase, turn, legality, bank cover) and either applies them or returns a coded error. Clients never compute outcomes.

### 8.2 Room manager
In-memory `Map<roomCode, Room>`. A `Room` owns: `RoomConfig`, `GameState`, participants (with `playerId`, role, seat, connection status), activity log (last 200 entries), chat log (last 200), timers, and the stats history (per-round stacks). Rooms are destroyed after N minutes (default 120) with no connected users.

Room codes: 6 chars from an unambiguous alphabet (no 0/O/1/I/L), collision-checked. Shareable link: `/r/ABC234`. Optional room password (host-set).

### 8.3 Messages (Zod-validated; document in `docs/PROTOCOL.md`)

**Client → Server intents** (each carries an `actionId` for idempotency):
- Room: `room:create`, `room:join {code, name, token, avatar}`, `room:leave`
- Host: `host:setDealer`, `host:assignSeat`, `host:kick`, `host:updateConfig`, `host:adjustChips {target, op, amount}`, `host:startSession`, `host:pause`, `host:resume`, `host:endSession`, `host:transferHost`, `host:approveRebuy`
- Seat: `seat:sit {seat}`, `seat:stand`
- Betting: `bet:add {amount}`, `bet:undo`, `bet:clear`, `bet:repeat`, `bet:lock`, `bet:sitOut`
- Dealer: `dealer:deal`, `dealer:reveal`, `dealer:draw` (manual mode), `dealer:nextRound`, `dealer:shuffle`
- Play: `play:hit`, `play:stand`, `play:double`, `play:split`, `play:insurance {accept}`
- Rebuy: `rebuy:request`
- Chat: `chat:send {text}` (≤300 chars, rate-limited)

**Server → Client:**
- `snapshot` — **viewer-filtered**, versioned full state (the truth)
- `events` — ordered batch of animation/log events with `seq`: `shuffled`, `cardDealt {to, handId, card|hidden}`, `cardFlipped`, `chipsBet`, `chipsPaid`, `chipsSwept`, `turnChanged`, `handResult`, `roundSummary`, `playerJoined/Left/Disconnected/Reconnected`, `configChanged`, `chipsAdjusted`, `hostChanged`, `chat`, …
- `error {code, message}` — e.g., `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `BANK_CANNOT_COVER`, `NOT_HOST`
- `presence` updates

**Client rule:** animate from `events` in order, then reconcile to `snapshot`. If a `seq` gap is detected, request a full resync.

### 8.4 Pacing ("beats")
Defined as constants in `packages/shared/constants/timing.ts`, e.g.: deal card 350ms, flip 450ms, dealer draw 700ms, settle per hand 600ms, shuffle 2200ms. The server emits events spaced by beats so all clients see the same rhythm. The client animation queue has a **catch-up mode** (speeds up if behind) so slow phones never desync from the truth.

### 8.5 Disconnect / reconnect
- A dropped player **stays seated** with their stack. The game continues.
- If it's their turn: wait the action timer (or 10s grace if the timer is off), then **auto-stand**. During betting, they sit out. Insurance defaults to **No**.
- Reconnect via token → the server re-attaches the identity and sends a full filtered `snapshot` + recent `events`/chat. No lost state.
- A seat is released after `seatHoldMinutes` (default 15) of disconnection; their stack is preserved for that identity until the room ends.
- Heartbeat + presence dots on avatars (green/grey).

---

## 9. Hidden information (P0 requirement)

- The **shoe** and the order of upcoming cards are **never serialised or sent** to any client.
- The **dealer's hole card** is sent as `{hidden: true}` to **everyone, including the Dealer**, until revealed. The server performs the blackjack peek.
- Only the server holds card identities for undealt/hidden cards; a card is sent to a client only when it is face-up on the table.
- Implement as **one function** `viewFor(state, viewerId)` with exhaustive unit tests, including "a spectator, a player and the dealer all receive no hole-card data."
- Add an automated test that scans every serialised payload for forbidden card identities.
- Never trust the client for anything: no client-supplied card values, totals, or outcomes.

---

## 10. (reserved for future rules: surrender, side bets)

---

## 11. Accounts & persistence (keep the DB tiny)

- **Live game state is memory-only.**
- **Guests:** join with a display name + avatar. The server issues a signed token (stored in localStorage) used for reconnection. Not stored in the DB.
- **Registered users:** email + password (argon2id), JWT in an httpOnly cookie. Signing up lets your name/avatar persist and ties session summaries to you.
- **Tables** (Drizzle):
  - `users(id uuid pk, email unique, username unique, password_hash, avatar_id, created_at)`
  - `session_summaries(id uuid pk, room_code, started_at, ended_at, rounds int, host_user_id nullable)`
  - `session_player_results(session_id fk, user_id fk nullable, display_name, total_buy_in int, final_stack int, net int, rounds_played int)`
- Written **only when a session ends**, and **only for registered users** plus an anonymised guest line (display name only). **No per-hand or per-round rows.**
- Optional nightly prune: delete `session_*` rows older than 180 days.
- *(Phase 6, optional)* `room_snapshots(room_code pk, json, updated_at)`: written on SIGTERM so a redeploy doesn't kill live games; deleted when the room ends.

---

## 12. Frontend: screens & layout

### Screens
1. **Landing:** "Create private table", "Join with code", "Sign in" (optional), name + avatar picker, sound unlock on first tap.
2. **Lobby:** room code + copy/share-link button, seat map, assign roles (host: tap a person → "Make dealer / Seat at 3 / Spectator / Kick"), rules panel, starting-stack editor per player, Start Session.
3. **Table:** the main game screen.
4. **Drawers/modals:** Chat + Activity Log (tabs), Host Panel (host only), Settings (volume sliders, reduced motion, card style), Standings (round summary), Rebuy prompt.

### Table layout
- **Mobile portrait (primary):** dealer at top centre with the shoe at top right and a discard tray; a seven-seat **arc** of players; **my seat is always rotated to the bottom** with my hand rendered large; other seats render compact (avatar, name, stack, bet, small cards) and **tap to inspect**. Action buttons (Hit / Stand / Double / Split / Insurance) sit in a thumb-reach bar at the bottom; the chip tray sits above it during betting. Respect safe-area insets.
- **Desktop / landscape:** a wide semicircular table; chat/activity on the right.
- **Aesthetics:** deep green felt with subtle texture and vignette, gold trim and engraved text ("BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17"), wood or dark-leather rail, warm spotlight. Selectable **Classic green** and **Dark luxury** (black/gold/burgundy) themes via CSS variables.
- Every seat shows: avatar, name, stack (animated count), current bet (chip stack), connection dot, role badge (Dealer button; Host crown).
- Always-visible hand totals (soft shown as "7/17"), plus result badges ("BLACKJACK", "BUST", "WIN +500", "PUSH").
- Accessibility: tap targets ≥44px, `prefers-reduced-motion` support, colour-blind-safe suits (4-colour deck option).

---

## 13. Animation specification ("make it feel real")

Build a `Choreographer` (event queue → animation timelines). Use Framer Motion with transforms only; target **60fps on mid-range Android**.

- **Shuffle:** riffle/overhand animation of the deck at the shoe + sound; a cut-card marker appears in the shoe.
- **Deal:** each card **flies from the shoe** along a slight arc, with rotation and settling shadow, landing with a tiny bounce; staggered by beats. Face-up cards are flipped in flight (3D `rotateY`); the hole card lands face-down and is slightly offset.
- **Flip/Reveal:** 3D flip with perspective and a subtle highlight sweep; the dealer hole-card reveal has a short pre-beat for drama.
- **Chips:** tapping a chip makes it hop from the tray onto the bet circle with a small bounce and stack offsets; stacks grow naturally; **Undo** slides the last chip back. Chip colours per denomination with edge stripes and a soft shadow.
- **Hit:** new card slides in next to the hand; the hand fan re-spaces smoothly. Splits: the pair separates into two hands with chips duplicating.
- **Double:** the extra chips tuck sideways; the card lands rotated 90° (a casino convention).
- **Settlement:** winning chips are pushed from the bank tray to the player; losing chips are swept to the bank; pushes stay put. Stack numbers **count up/down**. Coloured float text (+500).
- **Special moments:** blackjack = a gold glow burst + brief card shimmer; bust = quick shake + red tint on the hand; big win = a short confetti/sparkle overlay (kept short).
- **Turn indicator:** a pulsing ring around the active seat/hand plus a radial countdown for the action timer.
- **Dealer button & seat highlight transitions** when roles change.
- Provide a **Reduce motion** setting and an **Animation speed** setting (1×/1.5×/2×).
- Preload card/chip sprites; avoid layout thrash; `will-change: transform` only on active elements.

---

## 14. Sound specification

Howler.js, **audio sprites**, unlocked on the first user tap. Master / SFX / Music / Ambience sliders + mute, persisted locally.

Required cues: card shuffle, card deal (3 slight variants), card flip, chip tap/place, chip stack/settle (light & heavy variants), chip sweep, win (small & big), blackjack sting, bust, push, your-turn ping, timer-low tick, dealer reveal, chat pop, join/leave, rebuy "cha-ching", host-adjust notification. Optional: low ambient casino bed and soft lounge-jazz loop (**off by default for music, low for ambience**).
**All audio must be CC0 / royalty-free**; record sources in `CREDITS.md`. Never ship copyrighted music.
Haptics: short `navigator.vibrate` pulses on "your turn" and on blackjack (where supported, user-toggleable).

---

## 15. Chat & activity log

- **Chat:** text only, live, 300-char limit, rate-limited (e.g., 5 msgs/5s), sanitised (render as text; never `dangerouslySetInnerHTML`), shows avatar/name/time, unread badge, last 200 messages replayed on reconnect. Spectator chat obeys config. Host can mute/delete messages.
- **Activity log:** auto-generated, human-friendly lines: "Raj bet 500", "Asha hit — 17", "Asha busted with 24", "Dealer reveals 19", "Meera wins 750 (Blackjack)", "Host added 2,000 to Priya", "Dev rejoined". Shown in a tab and as small transient toasts for key events. Memory-only.

---

## 16. Standings after each round ("who stands at what amount")

After every round, show a **Round Summary** (dismissible; always re-openable from a Standings button):

- Rank, avatar, name
- This round: result per hand (W / L / PUSH / BJ / BUST) and **net ± chips**
- **Current stack**
- **Total buy-in** (starting + rebuys + top-ups)
- **Session net** = stack − total buy-in (coloured +/−)
- **Dealer/bank line:** current bank, net this round, net this session
- A compact **sparkline** of each player's stack over the rounds (from in-memory history, last ≤200 rounds)
- Final-standings version at session end (podium-style, shareable screenshot-friendly).

---

## 17. Security & fairness

- Server-authoritative validation of every intent (role, phase, turn, legality, bank cover, rate limit). Idempotent via `actionId`.
- Room code ≥ 6 chars unambiguous; optional password; rate-limit join attempts; Socket.IO origin allow-list; Helmet; strict CORS.
- Sanitise all text; length limits; no HTML rendering of user content.
- Passwords: argon2id; JWT httpOnly + SameSite=Lax; CSRF-safe design for any cookie-authenticated HTTP routes.
- Fair shuffling: `crypto` RNG. Log (server-side only) the shuffle seed/commitment per shoe for dispute debugging (not exposed).
- Host abuse transparency: all chip adjustments, kicks and config changes appear in the public log.
- Dependency hygiene: `pnpm audit` in CI.

---

## 18. Testing requirements

1. **Engine unit tests:** hand values (hard/soft/multiple aces), blackjack detection, bust, split (incl. aces, resplit limits, DAS), double rules, insurance, peek, dealer S17/H17, all settlement outcomes, rounding, shoe/cut-card reshuffle, edge cases (split then 21, dealer BJ with player BJ, all players bust).
2. **Property tests (`fast-check`):** random action sequences never break invariants: chip conservation; no negative stacks; liability ≤ bank; legal-action list matches what the reducer accepts; the engine never throws for any legal input.
3. **Hidden-info tests:** `viewFor` + a payload scanner proving no hole-card/shoe data reaches any viewer pre-reveal.
4. **Simulation:** a script plays 1,000,000 hands with basic strategy under the default rules and prints the house edge. It should land near **0.4–0.6%** in the house's favour; investigate if far off.
5. **Server integration:** scripted headless socket clients (3 players + dealer + spectator) play full rounds, including disconnect/reconnect mid-turn, kick, dealer change, rebuy, host chip adjustment.
6. **Playwright e2e:** 3–4 browser contexts complete a round on a mobile viewport; smoke tests for animations not throwing.
7. CI: lint + typecheck + tests on every push.

---

## 19. Deployment

- `Dockerfile` (multi-stage); the server serves the built `apps/web` assets; health endpoint `/healthz`.
- Env vars documented in `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `PORT`).
- Step-by-step `docs/DEPLOY.md` for **Fly.io** (always-on single machine, region near India/your friends), plus alternatives (Railway/Render). Neon Postgres for the DB; run migrations on boot.
- Note in docs: free tiers may sleep and a redeploy ends live rooms unless snapshots (Phase 6) are enabled.
- HTTPS/WSS only in production.

---

## 20. Build phases (stop after each for my review)

**Phase 0 — Scaffolding.** Monorepo, TS configs, lint, Vitest, CI, dev scripts, shared package wiring, `docs/` stubs.
*Accept:* `pnpm dev` runs the server and web; `pnpm test` passes.

**Phase 1 — Rules engine (no UI).** Full engine per Sections 4, 6, 9 with all tests and the simulation script.
*Accept:* all tests green; simulation edge is plausible; the engine can be driven from a CLI script.

**Phase 2 — Server & rooms.** Room manager, roles, config, intents/protocol, timers, pacing beats, disconnect/reconnect, `viewFor`, chat + activity log, host controls, chip adjustments, rebuys. Dev-only scripted clients.
*Accept:* integration tests pass: a full multi-client game including disconnect/reconnect, kick, dealer swap.

**Phase 3 — Playable ugly client.** Landing, lobby, table with plain styling, all actions, chat, standings. No animation or sound yet.
*Accept:* I can play a full session with friends on phones. The mobile layout is usable.

**Phase 4 — Casino feel.** Themes, card/chip art, the Choreographer + all animations in Section 13, all sounds in Section 14, haptics, settings.
*Accept:* a 60fps feel on a mid-range phone, no desync after a tab background/foreground, reduced-motion respected.

**Phase 5 — Accounts & summaries.** Optional sign-up/login, guest-claim, session summary writes, prune job.
*Accept:* a registered user's session results persist; the DB size is negligible.

**Phase 6 — Deploy & harden.** Docker, Fly.io deploy, optional room snapshots on SIGTERM, security pass, load test with ~12 headless connections.
*Accept:* friends can join from the real internet via link or code.

**Phase 7+ — Backlog (ask me first):** surrender; side bets (Perfect Pairs, 21+3); more themes/table felts; custom chip designs per player; PWA install polish; Google sign-in; spectator-to-player queue; session replay from event log; named lifetime leaderboard; table-talk emoji reactions; dealer auto-shuffle animations variants.

---

## 21. Definition of done for v1 (end of Phase 6)

- A host can create a private room, share a code/link, assign a human dealer, seat up to 7 players, and let others spectate.
- Full blackjack per Section 4 with server-enforced rules and the bank-liability invariant.
- No hidden info reaches any unauthorised client (proved by tests).
- Mobile-first, polished 2.5D table with the animations and sounds above.
- Live chat, activity log, per-round standings.
- Host controls over rules, chips, kicks, dealer assignment.
- Reconnect works mid-round.
- Deployed and playable by the group; the DB footprint is tiny.

**Begin with Phase 0. Before writing code, reply with: (a) a 10-line plan for Phase 0 and 1, and (b) any questions that block you.**