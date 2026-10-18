# PROMPT — Add Casino-Style Texas Hold'em Poker to the Existing Blackjack App

> Paste this whole file into your IDE agent (Claude Code / Antigravity). Save it as `docs/POKER_BRIEF.md`. **The agent must complete Phase A (analysis) and stop for my review before writing any poker code.**

---

## 0. How you (the coding agent) must work

You are a principal engineer with 25+ years of experience in system design and multiplayer game products. You are extending a **working, deployed, multiplayer blackjack web app**. Rules of engagement:

1. **Do not break blackjack.** It is the shipped product. Every phase ends with the full blackjack test suite green and a short manual regression checklist.
2. **Analyse before you build** (Phase A). Do not assume file names, patterns, or libraries from this brief. The names below (`reduce`, `viewFor`, `Room`, `Choreographer`...) describe the *intended architecture*; discover what actually exists and use the real names.
3. **Reuse, don't fork.** Extract shared platform pieces and keep game-specific logic separate. Do not copy-paste blackjack code into a "poker" copy.
4. **Strangler pattern.** Introduce abstractions around blackjack *without* changing its wire protocol or behaviour. Refactor behind tests.
5. **Pure engine first.** The poker rules engine is built and heavily tested with no UI, no sockets, no timers.
6. **Hidden information is a P0 requirement** (Section 6). A leaked hole card is a critical bug.
7. **No bots or AI players.** Scripted headless clients for tests only (in `/tools` or `/tests`), never in the UI.
8. **Ask before deviating** from decisions in this brief. If a requirement is ambiguous, choose the safest default, record it in `docs/DECISIONS.md`, and continue. Only stop for things that block progress.
9. Small commits, clear messages, keep `README.md` and `docs/` current. Put poker behind a feature flag (`ENABLE_POKER`) until Phase H.

---

## 1. Goal

Add a second game, **Texas Hold'em Poker**, to the same application. Friends already use it for blackjack. After this work:

- On the landing screen the user chooses **Blackjack** or **Poker** when creating a room. (Joining by code/link goes to whichever game that room is.)
- A **room is one game type for its lifetime** (v1). The game type is stored in the room, shown in the lobby, and drives which table UI/rules load.
- Poker plays **exactly as it is played in a casino cash game** (Section 5), with the same premium feel as blackjack: green felt / dark luxury themes, real-feeling cards and chips, polished animation, sound, live chat, activity log, spectators, host controls, reconnects, mobile-first.
- Everything stays **invite-only, friends-only, play money only**. No rake, no real money, no bots.

### Non-goals for this work
Real money; public lobbies/matchmaking; tournaments with late registration (backlog); Omaha/Stud/other variants (backlog; the engine must be *extensible* to them); bots; voice/video; horizontal scaling.

---

## 2. PHASE A — Analyse the existing blackjack app (deliverable: `docs/ANALYSIS.md`)

Read the whole codebase and produce a written analysis. **No code changes in this phase.** Cover, with file paths:

1. **Repo & build:** structure, packages, scripts, how web/server/shared are wired, env vars, how it deploys (Render), where static assets are served from.
2. **Game engine:** how blackjack state/actions/events are modelled (pure reducer? what's in state?), RNG/shuffle, config (`RoomConfig`), timing "beats", chip/bank accounting and invariants.
3. **Server:** `Room` manager lifecycle, participants/roles/seats, host & dealer permissions, timers, disconnect/reconnect and seat-hold logic, `viewFor`/redaction, snapshot + event stream, `seq` handling and resync, idempotent `actionId`s, error codes, rate limiting, chat and activity log.
4. **Protocol:** list every client→server intent and server→client message, with payload shapes (Zod schemas) and where they live.
5. **Client:** routes, screens (landing, lobby, table), Zustand stores, socket layer, `Choreographer`/animation system, sound manager, theme/CSS variables, chip & card components, chat/activity UI, host panel, standings UI, settings, mobile layout approach.
6. **Persistence:** DB schema, what's written and when, auth (guest vs registered), migrations tooling.
7. **Tests:** what exists (unit/property/e2e), coverage gaps, how to run them.
8. **Classification table:** for each module, mark **Shared (reusable as-is)**, **Shared after light refactor**, or **Blackjack-specific**. Be concrete (e.g., "`Deck`/shuffle: shared; `bankLiability`: blackjack-specific").
9. **Coupling risks:** places where blackjack assumptions are hard-coded into shared layers (e.g., "dealer is the bank", "turn order = seat order left→right", single "round" phases, bet timer, `RoomConfig` being blackjack-only, DB tables, route names, UI strings).
10. **Proposed refactor plan** (Section 4) adapted to the real code, with risk ranking and the smallest safe sequence of steps.
11. **Open questions** that block you (max 10).

**Stop here and wait for my approval.**

---

## 3. Product requirements for the multi-game platform

- **Landing:** after name/avatar, "Create table" asks **Game: Blackjack | Poker** (two large cards with art + 1-line description). The room code and `/r/CODE` link format stay the same. Joining fetches room metadata (`gameId`, status) first, then loads the correct table UI (**code-split** so blackjack players don't download poker assets and vice-versa).
- **Lobby:** shared shell (room code, share link, people list, seat assignment, kick, host transfer, chat). Game-specific settings panel (Blackjack rules vs Poker rules, from each game's config schema).
- **Shared across games:** identity (guest/registered), avatars, spectators, chat, activity log, host controls framework, sound manager, theme system, card & chip components, chip-adjustment transparency log, reconnect logic, pause/end-session, session standings framework, settings drawer, PWA/mobile shell.
- **Game-specific:** rules engine, config schema, roles beyond Host/Player/Spectator, table layout, action controls, animation timelines, sound cue set, standings columns.
- **Host can't change a room's game mid-session.** (Backlog: end session → start a different game in the same room with carried-over bankrolls.)
- Blackjack's existing behaviour, URLs, and saved data must keep working untouched.

---

## 4. Architecture for adding games

### 4.1 `GameModule` abstraction (server and shared package)
Introduce a game-agnostic interface and wrap blackjack as the first module **without altering its behaviour or wire format**. Adapt names to the real code, but the shape should be:

```ts
interface GameModule<Config, State, Action, Event, View> {
  id: 'blackjack' | 'poker';
  configSchema: ZodSchema<Config>;
  defaultConfig: Config;
  createState(config: Config, seated: Participant[], deckSource: DeckSource): State;
  reduce(state: State, action: Action, ctx: ReduceCtx): { state: State; events: Event[] };
  legalActions(state: State, playerId: string): LegalAction[];
  viewFor(state: State, viewerId: string): View;          // ALL redaction lives here
  timerSpec(state: State): TimerSpec[];                     // what the Room must schedule
  onTimeout(state: State, playerId: string): Action;        // default action on timer expiry
  onDisconnect(state: State, playerId: string): Action | null;
  standings(state: State): StandingsRow[];                  // for the shared standings UI
  invariants(state: State): string[];                       // chip conservation etc., used in tests/dev asserts
}
```
- The generic `Room` owns: participants, roles, connections, chat, activity log, timers, pause, host controls, reconnect, snapshot/event broadcasting. It delegates rules to the `GameModule`.
- Engines stay **pure** (no timers, sockets, wall-clock, or hidden randomness; the deck/RNG is injected).
- **Wire protocol:** do **not** rename existing blackjack messages in this effort. Add poker messages namespaced `poker:*` following the same conventions (Zod, `actionId`, `seq`). Shared messages (chat, host, presence, rebuy) are reused. Revisit unification only in the backlog.
- A `GameRegistry` maps `gameId → GameModule` and `gameId → client table component` (lazy imported).

### 4.2 Safe refactor sequence
1. Write **characterization tests** that lock current blackjack behaviour: engine golden tests (seeded shoe → expected events/stacks), server integration (full multi-client round incl. reconnect), and a Playwright smoke test. Do this *before* any refactor.
2. Extract shared deck/RNG, chip math, timers, activity/chat, standings framework into game-agnostic modules with unchanged APIs.
3. Introduce `GameModule` + `GameRegistry`; wrap blackjack; all tests stay green.
4. Only then add poker.

### 4.3 Data & persistence changes (backward compatible, tiny)
- Add `game_type text not null default 'blackjack'` to `session_summaries`; add a nullable `hands_played int` or reuse `rounds`. Provide a Drizzle migration that does not alter existing rows' meaning.
- `session_player_results` is reused (buy-in, final stack, net). **No per-hand rows.** Hand history lives in memory only (last 100 hands per room).
- Live poker state is memory-only like blackjack. If the optional room-snapshot feature exists, include `gameId` and poker state in it.

### 4.4 Randomness & decks
Reuse the existing secure shuffle (`crypto.randomInt` Fisher–Yates). Poker uses a **fresh, fully shuffled 52-card deck every hand** (no shoe, no cut card). The deck is never serialised or sent to any client.

---

## 5. Poker rules specification — Texas Hold'em, No-Limit, cash game (as played in casinos)

### 5.1 Table & variant
- **Variant:** Texas Hold'em. **Betting structure:** No-Limit (the engine must be built around a pluggable `BettingStructure` so Pot-Limit and Fixed-Limit can be added later without rewriting the engine).
- **Seats:** 2–9 (host-configurable, default 6). Spectators allowed (default max 8).
- **Deck:** standard 52 cards, no jokers. Suits have no rank.
- **Pot is player vs player.** There is **no bank/house** and no rake (config `rakePercent` exists, default 0, unused in v1 UI). Do **not** reuse blackjack's bank-liability logic.
- **The "dealer":** in a casino the dealer deals and runs the game but has no stake. The **dealer button** (a puck) marks the nominal dealer position for the hand and rotates clockwise each hand. See `dealerMode` in 5.10.

### 5.2 Hand rankings (highest → lowest), best five of seven cards
1. **Straight flush** (incl. **Royal flush** = A-K-Q-J-10 suited)
2. **Four of a kind**
3. **Full house** (three of a kind + pair)
4. **Flush** (five of one suit)
5. **Straight** (five consecutive ranks; **Ace plays high (10-J-Q-K-A) or low (A-2-3-4-5, "the wheel", the lowest straight)**; no wrap-around such as Q-K-A-2-3)
6. **Three of a kind**
7. **Two pair**
8. **One pair**
9. **High card**

**Comparison:** compare category first, then the ranks that define the hand, then **kickers**. Examples the evaluator must get right:
- Flush vs flush: compare highest card, then next, etc.
- Full house: compare the trips rank first, then the pair rank.
- Two pair: higher pair, then lower pair, then the single kicker.
- Four of a kind / trips / pair: compare the set rank, then kickers in descending order.
- Wheel straight (5-high) loses to every other straight; A-high straight beats K-high.
- **The board can play:** a player may use all five community cards, zero, one, or two hole cards. If the board is the best five for several players, they split.
- Only five cards count: a 6th/7th card never breaks a tie unless it is among the best five.
- Identical best-five rank sets = **tie → split the pot**. Suits never break ties.

### 5.3 Hand flow (exactly as in a casino)
1. **Pre-hand:** determine the button, small blind, and big blind (5.4). Collect optional **antes** (config, default 0). Post blinds. Shuffle a fresh deck.
2. **Deal hole cards:** two cards face-down to each player in the hand, one card at a time, **starting with the small blind** (first active player left of the button) and going clockwise, twice around. The button receives the last card.
3. **Pre-flop betting round.**
4. **Burn one card, deal the Flop** (three community cards, face-up). **Flop betting round.**
5. **Burn one card, deal the Turn** (4th community card). **Turn betting round.**
6. **Burn one card, deal the River** (5th community card). **River betting round.**
7. **Showdown** (5.7) if more than one player remains; otherwise the last remaining player wins without showing.
8. **Award pot(s)** (5.6, 5.8). **Hand summary/standings.** Button moves; next hand.
- Burn cards are removed from the deck, never shown, and exist in animation only (a face-down card slid to the muck).
- If everyone but one player folds at any time, the hand ends **immediately**; remaining streets are not dealt.

### 5.4 Button, blinds, and acting order
- **Blinds:** small blind (SB) and big blind (BB), default **25 / 50**. Blinds are forced bets posted before the cards are dealt. The BB equals the minimum bet.
- **Moving-button / dead-button algorithm (implement and document precisely):**
  1. The **big blind** goes to the next **eligible** player clockwise after the previous hand's BB seat. *Eligible* = seated, not sitting out, has chips.
  2. The **small blind** is the seat immediately counter-clockwise of the BB. If an eligible player is there, they post the SB. If that seat is empty/ineligible, it is a **dead small blind** (nobody posts it; the BB is still posted).
  3. The **button** is the seat immediately counter-clockwise of the SB seat (it may rest on an empty seat).
  4. A player can never skip the BB; blinds rotate by seat, not by "who is next to act".
- **Short stacks:** a player who cannot cover a blind posts what they have and is all-in for that amount.
- **Heads-up (exactly 2 eligible players):** the **button posts the SB**, the other player posts the BB. **Pre-flop, the button/SB acts first; on every later street, the BB acts first** (button acts last).
- **Acting order, 3+ players:**
  - **Pre-flop:** the first to act is the player **left of the big blind** ("under the gun"); action proceeds clockwise, and the **big blind acts last** (and has the "option" to raise if everyone just calls).
  - **Post-flop (flop/turn/river):** the first to act is the first active player **left of the button** (usually the small blind); the **button acts last**.
- **Round ends** when all remaining non-folded, non-all-in players have acted **and** their contributions to the round are equal (or they are all-in). An action by someone who is all-in is skipped.

### 5.5 Player actions and No-Limit rules
Actions: **Fold, Check, Call, Bet, Raise, All-in.**
- **Check:** only when no bet to match this round (the BB with no raise pre-flop may check = "option").
- **Bet:** the first wager in a round post-flop. **Minimum bet = BB** (or the player's whole stack if smaller).
- **Call:** match the current bet. If the player has fewer chips than needed, the call is an **all-in call** for less.
- **Raise:** increase the current bet. **Minimum raise = the size of the previous bet/raise increment in the same round** (pre-flop the first raise increment is the BB). The raise amount is **raise-to** (total for the round); maximum = the player's stack. No cap on number of raises in No-Limit.
  - *Example:* BB 50; UTG raises to 150 (increment 100). Next player's min re-raise is **to 250** (≥ +100 over 150). If that player raises to 400 (increment 250), the next min re-raise is to **650**.
- **All-in:** commit the entire stack. If it exceeds the min-raise it's a **full raise** and re-opens betting; if it's **less than a full raise**, it is an **incomplete raise**:
  - It does **not reopen betting** to players who have already acted this round (they may only call or fold), but players who haven't yet acted *can* raise (min raise measured from the last full raise increment).
  - *Example:* A bets 100. B goes all-in to 150 (increment 50 < 100). C (not yet acted) may fold, call 150, or raise to a minimum of 250. A (already acted) facing 50 more may call or fold, but **may not raise** *unless* a full raise by someone else later re-opens betting.
- **Betting is by amount via the UI**, so "string bets" are impossible by design. A raise action must state the final **raise-to** amount; the server validates min/max.
- **Cannot act out of turn.** Cannot check when facing a bet; cannot fold when checking is free **without confirmation in the UI** (server allows it, UI warns).
- **Uncalled bets are returned:** if the largest bet/raise isn't fully matched (others folded or are all-in for less), the **excess is returned to that player** before the showdown/pot split.
- **Timers:** action timer (default 30s, plus optional time bank). On expiry: **auto-check if free, otherwise auto-fold.** Never auto-bet or auto-call.

### 5.6 Side pots (implement exactly; test heavily)
Track every player's total **contribution** for the hand. When one or more players are all-in for different amounts, build pots in layers:
1. Sort distinct all-in contribution levels ascending.
2. For each level L (and the last level = the highest contribution still matched): the layer's pot = for each player, `min(contribution, L) - previousLevel` (only if > 0), summed; **folded players' chips stay in the pots** they contributed to.
3. A pot's **eligible winners** = players who contributed to that layer **and have not folded**.
4. Merge adjacent layers with identical eligible sets. The first layer is the **main pot**; the rest are **side pots**.
5. Each pot is awarded **independently** to the best eligible hand(s) at showdown.
- *Worked example (must be a unit test):* A all-in 100; B all-in 300; C and D each put in 500; E folded after putting in 50. Total = 1,450.
  - Main pot (level 100): A100 + B100 + C100 + D100 + E50 = **450**, eligible A, B, C, D.
  - Side pot 1 (levels 100→300): B200 + C200 + D200 = **600**, eligible B, C, D.
  - Side pot 2 (levels 300→500): C200 + D200 = **400**, eligible C, D.
  - Sum 450 + 600 + 400 = 1,450 ✓.

### 5.7 Showdown & revealing cards (casino etiquette, server-enforced)
- If **only one player remains** (everyone else folded), they win and **are not required to show**; their cards stay hidden (they may voluntarily show after the hand).
- If a showdown happens:
  - **Reveal order:** the **last player who bet or raised on the final betting round** shows first. If the river was checked through, the **first player to act (left of the button)** shows first, then clockwise.
  - A player whose hand **cannot beat or tie** a hand already shown may **muck** (fold face-down). The server auto-mucks such hands; **players must show if their hand wins or ties.** The server decides, not the client.
  - **All-in showdown:** when all remaining players are all-in (or only one has chips and has been called), **betting is closed and all remaining hands are turned face-up immediately**, then the remaining community cards are dealt with dramatic pacing ("run-out").
- **Voluntary show:** after the hand ends, any player may choose to show one or both hole cards (broadcast to everyone). Nothing is revealed involuntarily for folded/mucked hands.
- **Hand name display:** the winner is announced with the winning hand name ("Full House, Kings over Tens"), the five winning cards highlighted and the rest dimmed.

### 5.8 Awarding pots, ties and odd chips
- Chips are **integers**. Define `chipUnit` = the smallest denomination (default 25). All blinds/bets/stacks are multiples of `chipUnit`; validate config.
- **Split pots:** a pot with several tied winners is divided as equally as possible in `chipUnit`s. **Remaining odd chip units go one at a time to the tied winners starting with the first player clockwise from the button** (standard casino rule).
- **Best-hand determination is per pot among eligible players only.**
- Update stacks, then emit result events in a sensible order for animation (side pots last-to-first or first-to-last consistently).

### 5.9 Specials: leaving, disconnecting, joining, rebuying
- **Disconnect mid-hand:** the hand continues. After a short grace (10s) the disconnected player's actions use the timeout rule (auto-check/auto-fold). Their cards stay hidden and in play (a disconnected player in a showdown still wins pots they've earned). After **2 consecutive timeouts** they are automatically marked **Sitting out** (dealt out of future hands; stack preserved; blinds are **not** charged while sitting out; "I'm back" button re-enters them from the **next hand**).
- **Reconnect:** full filtered snapshot + recent events/chat; they see their own hole cards again and the current state.
- **Player stands up/leaves mid-hand:** their hand is **folded**; chips already committed stay in the pot. Their remaining stack is held for the reconnect window, then returned to their identity (not removed from `totalBuyIn` accounting).
- **Joining mid-session:** a new player is dealt in from the **next hand** (`newPlayerPolicy: 'next-hand'`, no missed-blind penalty in v1).
- **Rebuy / top-up:**
  - Only **between hands** (never mid-hand).
  - A busted player (stack 0) can rebuy; others can **top up** to `maxBuyIn` (default 10,000).
  - Host approval optional (config). Rebuy amounts between `minBuyIn` and `maxBuyIn`.
  - Rebuys/top-ups add to `totalBuyIn` (so **session net = stack − totalBuyIn** stays correct).
- **One player left with chips:** the session pauses ("Waiting for players") until ≥2 eligible players exist.
- **Host kick mid-hand:** kicked player's hand is folded; chips in the pot stay in the pot; their stack is removed from the table and logged publicly.
- **Pausing:** host can pause between actions; the action timer freezes.

### 5.10 `PokerConfig` (host-editable between hands; changes queue until the next hand)

```ts
PokerConfig = {
  variant: 'holdem'                     // extensible later
  bettingStructure: 'no-limit'          // 'pot-limit' | 'fixed-limit' later
  maxSeats: 2..9                        // default 6
  smallBlind: number                    // default 25
  bigBlind: number                      // default 50
  ante: number                          // default 0
  chipDenominations: number[]           // default [25, 50, 100, 500, 1000]
  chipUnit: number                      // default = min(chipDenominations)
  startingStack: number                 // default 5000 (100 BB); host may set per player
  minBuyIn: number                      // default 2000
  maxBuyIn: number                      // default 10000
  rebuyEnabled: boolean                 // default true
  rebuyRequiresHostApproval: boolean    // default false
  actionTimerSec: number | null         // default 30
  timeBankSec: number | null            // default 60 total per player per session (null = off)
  dealerMode: 'auto' | 'human'          // default 'auto'
  autoRevealAllInHands: boolean         // default true (standard casino rule)
  showdownVoluntaryShow: boolean        // default true
  blindIncreaseEveryHands: number|null  // default null (static blinds); optional simple escalator
  spectatorsCanChat: boolean            // default true
  maxSpectators: number                 // default 8
  rakePercent: 0                        // reserved; keep 0
}
```
Validate with Zod; reject impossible combos (BB < SB, blinds not multiples of `chipUnit`, `minBuyIn` < 10×BB is allowed but warn, etc.).

### 5.11 Roles & host controls (poker)
- **Host:** everything in blackjack's host panel (assign seats, kick, edit config, adjust any stack, approve rebuys, pause/resume, end session, transfer host) **plus** poker config. Every chip adjustment, kick and config change is posted to the **public activity log**.
- **Players:** act in turn; request rebuy/top-up; sit out/return; chat.
- **Spectators:** watch (never see hole cards), chat if enabled, can request a seat.
- **`dealerMode`:**
  - `auto` (default): the server deals and paces everything; **the dealer button just rotates among players**.
  - `human`: reuse blackjack's non-playing **Dealer** role. The Dealer only **paces** the hand with buttons: *Deal hand → Deal flop → Deal turn → Deal river → Showdown/Next hand*. The Dealer **never sees hidden cards** and cannot alter outcomes. If the Dealer is idle too long, the host can switch to `auto`.

### 5.12 Chips & bookkeeping invariants
- **Conservation:** `sum(stacks) + sum(pots) + sum(uncollected bets)` changes **only** via buy-in, rebuy, top-up, host adjustment, or kick removal. Enforce through `invariants()` and property tests.
- No negative stacks; no bet exceeding a stack; no chips created by rounding.
- **Session net = stack − totalBuyIn** per player.

---

## 6. Hidden information (P0)

- The **deck** and undealt/burned cards are never serialised.
- A player's **hole cards** are sent **only to that player** until they are legitimately revealed (showdown reveal, all-in reveal, or voluntary show). Everyone else sees `{hidden:true}` placeholders (so the UI shows face-down cards).
- **Spectators, the Dealer (in human mode) and folded players** never receive any other player's hole cards.
- **Community cards** are sent only when dealt face-up.
- Hand-strength labels shown to a player ("You have: Pair of Jacks") are computed **server-side for that viewer only** (or client-side from their own cards + board, which they legitimately know). No equity/odds calculators in v1.
- **All redaction lives in `PokerModule.viewFor(state, viewerId)`**, with exhaustive tests plus a **payload scanner test** that checks every serialised message sent to each role for forbidden card identities (run over full randomized hands with all four roles connected).
- Events stream carefully: a `cardDealt` event to non-owners carries no rank/suit; an owner gets their own cards in a separate per-recipient event.
- Never trust clients for cards, totals, pot sizes, or outcomes. The server validates raise-to bounds, turn, and legality for every intent.

---

## 7. Poker state machine (server)

```
WAITING_FOR_PLAYERS → HAND_START → POSTING_BLINDS → DEALING_HOLE
→ PREFLOP_BETTING → [FLOP_DEAL → FLOP_BETTING] → [TURN_DEAL → TURN_BETTING] → [RIVER_DEAL → RIVER_BETTING]
→ SHOWDOWN → AWARD_POTS → HAND_SUMMARY → (rebuy/adjust window) → HAND_START …
   (early exits: everyone folds → AWARD_POTS; all-in lock → RUNOUT → SHOWDOWN)
```
- A hand has a monotonic `handNumber`. Betting rounds track: `currentBet`, `lastFullRaiseSize`, `actedThisRound`, `raiseReopened` per player, `toAct`, and each player's `committedThisRound` / `committedTotal`.
- Server-paced **beats** (reuse the existing timing constants file, add poker entries): deal hole card 300ms, deal board card 450ms, burn 250ms, street pause 600ms, all-in runout pause 1500ms before the turn/river, showdown reveal 900ms, pot award per pot 800ms.
- Auto-advance rules: skip players who are folded/all-in; close the round when all remaining have acted and matched; if ≤1 player can still bet, lock betting and run out the board.
- Hand summary between hands: show for ~6s or until the host/Dealer/next-ready triggers the next hand (config `autoNextHandDelaySec`, default 6; in `human` mode the Dealer starts it).

---

## 8. Protocol additions (follow existing conventions: Zod, `actionId`, `seq`, coded errors)

**Client → Server:** `poker:fold`, `poker:check`, `poker:call`, `poker:bet {amount}`, `poker:raise {to}`, `poker:allIn`, `poker:sitOut`, `poker:sitIn`, `poker:showCards {which: [0|1]}`, `poker:rebuy {amount}`, `poker:topUp {amount}`; Dealer (human mode): `poker:dealHand|dealFlop|dealTurn|dealRiver|nextHand`; Host: `host:updatePokerConfig` and existing host intents reused.
**Server → Client:** `poker:snapshot` (viewer-filtered, versioned) and `poker:events` (ordered batch): `handStarted {handNumber, button, sb, bb}`, `blindsPosted`, `holeCardsDealt` (per-recipient), `cardBurned`, `boardCardDealt {street, card}`, `turnChanged`, `actionTaken {playerId, type, amount, stackAfter}`, `betsCollected` (to pot), `allInLock`, `handsRevealed`, `showdownResult`, `potAwarded {potIndex, winners, amount, handName}`, `unCalledBetReturned`, `handEnded`, `standingsUpdated`, `playerSatOut/In`, etc.
Errors: `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `RAISE_TOO_SMALL`, `RAISE_EXCEEDS_STACK`, `BETTING_NOT_REOPENED`, `HAND_NOT_ACTIVE`, `NOT_HOST`.
Same client rule as blackjack: **animate from events, reconcile to the snapshot; on `seq` gap, request resync.** Document everything in `docs/PROTOCOL.md`.

---

## 9. Poker UI/UX spec (mobile-first; reuse existing shell, theme, components)

### Table layout
- **Mobile portrait:** an oval felt table (2.5D, same CSS-3D approach as blackjack). **My seat is always rotated to the bottom**, with my two hole cards large and tappable (lift-the-corners "peek" micro-interaction; a "Hold to peek" is optional). Other seats sit around the oval, compact: avatar, name, stack (animated), current-street bet chips in front of them, status badges (**D** button puck, **SB**, **BB**, All-in, Folded, Sitting out, Disconnected dot). **Community cards and pots are centered**; main pot big, side pots as smaller stacks labeled "Side 1 / Side 2".
- **Desktop/landscape:** wide oval, chat/activity panel on the right.
- **Seats 2–9** must all be legible at 375px width (test 9-handed).
- Active player: pulsing ring + radial countdown (and time-bank indicator).

### Action controls (bottom thumb bar, only legal ones shown)
- Primary row: **Fold** | **Check / Call [amount]** | **Bet / Raise**.
- Tapping Bet/Raise opens a **bet panel**: slider + typed input + **quick buttons: Min · ½ Pot · ¾ Pot · Pot · All-in**, and **−/+ buttons stepping by one chip unit or BB**. Shows the raise-to amount and the resulting stack. **Confirm** button repeats the amount ("Raise to 450"). Slider respects min-raise and max-stack.
- **Safety:** if Check is free and the player taps Fold, ask "You can check for free. Fold anyway?" All-in always requires a second tap/confirm.
- **Pre-actions (P2):** "Check/Fold", "Call any", "Fold to bet" toggles that apply when it becomes your turn.
- Between hands: **Sit out / I'm back**, **Rebuy / Top up**, **Show cards** (post-hand), **Standings**, **Hand history**.

### Other UI
- **Hand-strength hint** to the owner (toggle in settings), e.g., "Two pair, Aces and Eights."
- **Showdown overlay:** hand name, highlight the winning five cards, dim others, +amount floating over winners.
- **Hand history drawer** (memory-only, last 100 hands): hand #, button/blinds, board, per-player net, shown hands, pots and winners.
- **Standings** after each hand (shared standings component): rank, avatar, name, stack, total buy-in, **session net**, hands played, a sparkline of stack over hands. At session end: final standings.
- Themes: **Classic green** and **Dark luxury** apply to poker too (felt, rail, chip colours, "TEXAS HOLD'EM · NO LIMIT · BLINDS 25/50" engraved text).
- Accessibility: tap targets ≥ 44px, reduced-motion, four-colour deck option, safe-area insets.

---

## 10. Animation & sound (match the blackjack polish; reuse the Choreographer core and sound manager)

**Animations (transform/opacity only, 60fps target):**
- **Shuffle** at hand start (riffle at the dealer position) + **dealer button puck** slides to the new position with a soft thud.
- **Blinds:** chips hop from stacks to the blind positions.
- **Hole cards:** dealt one at a time from the dealer position, flying along an arc to each seat, face-down; owner's cards flip up to them locally. Burn cards slide face-down to the muck before each street.
- **Flop/Turn/River:** the three flop cards fan out with a staggered flip; turn and river with a small pre-beat for drama.
- **Bets:** chips slide from the stack to the bet spot in front of the player with stacked offsets; **check = knuckle-tap animation + sound**; **fold = cards toss to the muck** and the seat dims.
- **Collect:** at street end, all bets sweep to the center pot; the pot counter ticks up; side pots separate visually.
- **All-in:** push-forward chip shove with a distinct sound and badge; **all-in showdown** flips hands face-up with a spotlight and slow runout of remaining cards.
- **Showdown:** winning five cards glow; the pot chips slide to the winner(s); split pots divide chips; stack numbers count up; "+450" float text.
- Special moments: big win, quads/straight flush/royal flush gets a gold shimmer burst; "Bad beat" subtle effect (optional).
- Respect the existing **Reduce motion** and **Animation speed** settings.

**Sound (CC0/royalty-free; add to the existing sprite + `CREDITS.md`):** card deal (variants), card flip, flop fan, burn slide, **check tap (table knock)**, fold toss, chip bet (light/heavy), chips-to-pot sweep, all-in shove, showdown reveal sting, win (small/big), your-turn ping, timer tick (last 5s), dealer-button thud, rebuy "cha-ching". Reuse chat/join/leave cues. Obey the existing volume sliders and mute.
Haptics on "your turn" and big wins (where supported).

---

## 11. Shared social features
Reuse chat (text only, rate-limited, sanitized), activity log (add poker lines: "Raj raises to 450", "Meera checks", "Asha folds", "Dev is all-in (1,850)", "Flop: K♠ 8♥ 3♦", "Meera wins 1,200 with Two Pair"), toasts, presence dots, host/spectator controls. Activity-log lines for hole cards are **never** emitted unless legitimately revealed.

---

## 12. Testing requirements

1. **Hand evaluator:** unit tests for every category and tie-break above; a **brute-force cross-check** (evaluate all 21 five-card combos of 7 cards; best must equal the fast evaluator) over millions of random hands. **Frequency sanity test** over ≥ 1M random 7-card hands should approximate: high card 17.4%, pair 43.8%, two pair 23.5%, trips 4.83%, straight 4.62%, flush 3.03%, full house 2.60%, quads 0.168%, straight flush (incl. royal) 0.031%.
2. **Betting engine:** min-raise tracking, raise-to validation, incomplete all-in not reopening, BB option, heads-up order (button acts first pre-flop, last post-flop), 3-handed ordering, dead SB, short-blind all-in, uncalled-bet return, auto-fold/check on timeout.
3. **Side pots:** the worked example in 5.6, multiple all-ins, folded contributors, split pots, odd-chip distribution starting left of the button, a player winning a main pot but losing a side pot.
4. **Property tests (`fast-check`):** random legal action sequences never break invariants (chip conservation, no negatives, pots sum to contributions, legal-action list ≡ what the reducer accepts, engine never throws on legal input, every hand terminates).
5. **Hidden-info tests:** `viewFor` for each role + the payload scanner across full simulated hands.
6. **Server integration:** headless clients (4–6 players + spectator [+ dealer in human mode]) play full hands including all-in showdown, split pot, disconnect/reconnect mid-hand, timeout auto-fold, rebuy between hands, kick mid-hand, host chip adjustment, blinds change queued to next hand.
7. **Playwright e2e:** mobile viewport, 3–4 contexts, complete a hand to showdown; blackjack e2e still passes; game-picker flow creates the right room type; joining a poker room by link loads poker UI only.
8. **Regression:** the Phase B characterization tests for blackjack must pass at every phase.
9. CI: lint + typecheck + all tests on push.

---

## 13. Deployment & migration
- Same single Node service on Render; add the poker client chunk via code-splitting; no new infra.
- Run the DB migration on boot (backward compatible). Document in `docs/DEPLOY.md`.
- Keep `ENABLE_POKER` flag until Phase H sign-off, then default on.
- If room snapshots exist, version them (`gameId`, `schemaVersion`) so in-flight blackjack rooms survive the deploy.

---

## 14. Build phases (stop after each for my review)

**Phase A — Analysis (no code).** Produce `docs/ANALYSIS.md` per Section 2. *Accept:* I approve the analysis and refactor plan.

**Phase B — Freeze blackjack.** Characterization tests (engine golden, server integration, Playwright smoke). *Accept:* all green on current `main`; documented how to run.

**Phase C — Platform extraction.** `GameModule` + `GameRegistry`, wrap blackjack, generic Room delegating to modules, shared deck/chips/standings/timers/logs extracted, game picker data model (room `gameId`), DB migration for `game_type`. *Accept:* blackjack behaviour identical (all tests green), room metadata exposes `gameId`.

**Phase D — Poker engine (pure).** Cards/evaluator, betting engine, side pots, showdown, button/blinds, `PokerConfig`, invariants, simulation scripts, all engine tests from Section 12.1–12.4. *Accept:* all green, brute-force + frequency checks pass; a CLI script plays a complete hand.

**Phase E — Poker server module.** `PokerModule` (`reduce`, `viewFor`, timers, timeouts, disconnect handling), protocol messages, hole-card privacy, rebuys, host controls, human-dealer mode, hand history, activity log. Headless test clients. *Accept:* integration tests (12.5–12.6) pass.

**Phase F — Poker client (plain styling).** Landing game picker, lobby per-game config, poker table (all seats, board, pots), action bar with bet slider, showdown, standings, hand history, chat/activity, mobile layout up to 9 seats. No animation/sound yet. *Accept:* I can play a full session of poker with friends on phones; blackjack unaffected.

**Phase G — Casino feel.** All animations (Section 10), sounds, haptics, themes applied to poker, settings. *Accept:* smooth on a mid-range Android phone, no desync after backgrounding, reduced-motion honoured.

**Phase H — Harden & ship.** Security pass (rate limits, validation, payload scanner in CI), load test (~12 headless connections across 2 rooms of different games), deploy to Render, flip `ENABLE_POKER` on, update docs.

**Phase I+ Backlog (ask me first):** Pot-Limit and Fixed-Limit; Omaha; straddle; run-it-twice; tournaments (levels, blind clock, late reg); time-bank refinements; pre-actions polish; dealer-choice games; shared bankroll across games in one room; "show one card" options; table themes; emoji reactions; session replay from the event log; all-time leaderboards.

---

## 15. Definition of done (end of Phase H)

- Landing offers **Blackjack | Poker**; a poker room works end-to-end via code or link, with spectators, chat, activity log, host controls, reconnects, rebuys.
- Poker follows **casino Texas Hold'em No-Limit rules** exactly as in Section 5 (button/blinds incl. heads-up, min-raise and incomplete-raise rules, side pots, showdown order, mucking, odd chips, all-in reveal).
- **No hidden card ever reaches an unauthorised client** (proved by tests).
- Blackjack is unchanged and fully regression-tested.
- Same premium look, animation and sound quality as blackjack, mobile-first up to 9 seats.
- DB footprint remains tiny (session summaries only).
- Deployed on Render and playable by the group.

**Begin with Phase A. Reply with the contents of `docs/ANALYSIS.md` (or a link to it) plus up to 10 blocking questions. Do not write poker code until I approve.**