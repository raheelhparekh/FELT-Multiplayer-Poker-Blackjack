# DECISIONS.md

All architectural decisions not explicitly fixed by the brief are recorded here.
Format: `[DATE] DECISION: reason`

---

## Phase 0

**[2026-10-03] Biome over ESLint + Prettier**
Biome is faster (single Rust process), requires one config file, and produces equivalent results. ESLint plugins can be added later if needed.

**[2026-10-03] Docker Postgres for local dev**
Matches the production Neon Postgres environment. A `.env` flag can switch to `better-sqlite3` via Drizzle if Docker is unavailable (Phase 2 will implement this).

**[2026-10-03] Auth stub until Phase 5**
No DB tables or JWT code until Phase 5. Phase 3 uses guest tokens only (signed with `JWT_SECRET`, stored in `localStorage`).

**[2026-10-03] Tailwind 3.x**
Latest stable (3.4.x). Tailwind 4 is in beta — not used until stable.

**[2026-10-03] Vite alias for @felt/shared in dev**
The web app resolves `@felt/shared` directly to `packages/shared/src` in dev mode (via Vite alias) so changes are HMR-hot without a separate build step. Production uses the compiled `dist/`.

**[2026-10-03] `reduce()` receives card payloads from server**
Randomness (drawn cards) is NOT generated inside the reducer. The server draws cards from the shoe before calling `reduce()` and passes them in the action payload. This keeps the reducer pure and deterministic.

**[2026-10-03] auto-STAND on action timer expiry (never auto-hit)**
Matches the brief. Auto-stand is the safest default (no chips lost beyond the current bet).

**[2026-10-03] Hole card hidden from dealer's own client**
Per Section 9: the server peeks server-side. The dealer's client NEVER sees the hole card until `dealer:reveal`. The `viewFor` function treats the dealer identically to all other viewers for the hole card.

---

## Phase 2

**[2026-10-03] In-memory Room State & Guest Tokens**
Live game state is strictly memory-only per Section 11. Guest tokens are signed HMAC-SHA256 payloads (`{ playerId, roomCode, displayName, avatarId }`) created and verified with `JWT_SECRET`, enabling reconnection without database dependencies.

**[2026-10-03] Pacing Control for Tests**
`pacingEnabled` boolean option allows server beats (deal 350ms, flip 450ms, dealer draw 700ms) in production mode, while running integration test suites at instant speed without sleeping real seconds.

**[2026-10-03] Automatic Host Transfer on Disconnect**
If the room host disconnects, the room automatically promotes the longest-seated connected player (or first connected user) to host and logs it publicly in the activity feed to prevent abandoned rooms.

**[2026-10-03] Reconnection Identity Preservation**
A disconnected player's seat and stack are preserved for `ROOM.SEAT_HOLD_MINUTES` (15 minutes). Mid-turn disconnect auto-stands on deadline, and reconnecting with token immediately re-attaches identity, clears hold timers, and broadcasts fresh snapshot.

