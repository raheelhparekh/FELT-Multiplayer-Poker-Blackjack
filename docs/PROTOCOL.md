# PROTOCOL.md — Socket.IO Message Protocol

Complete documentation of all Socket.IO messages, event payloads, and invariants implemented in Phase 2.

## Transport & Framing

- **Transport:** Socket.IO over WebSocket (with polling fallback).
- **Serialisation:** All payloads are JSON-serialised.
- **Idempotency:** Client intents may provide an `actionId` (UUID v4) for deduplication (server caches for 60s).
- **Sequencing:** Server events and snapshots carry a monotonically increasing sequence counter `seq` per room.
- **Hidden Info (P0):** The `snapshot` is viewer-filtered via `viewFor(state, viewerId)`. The hole card is `{ hidden: true }` until `dealer_turn` reveal. Shoe cards and `dealerHasBlackjack` are never transmitted.

---

## Client → Server Intents

### Room Lifecycle

#### `room:create`
Creates a new private room and assigns the caller as host.
```ts
{
  displayName: string; // 1..30 chars
  avatarId: string;
  password?: string;
  config?: RoomConfig;
  actionId?: string;
}
```
**Ack / response:** `{ roomCode: string, token: string, participant: Participant }`

#### `room:join`
Joins an existing room by code, or reconnects if `token` is supplied.
```ts
{
  code: string;        // 6 characters
  displayName: string;
  avatarId: string;
  token?: string;      // guest reconnection token
  password?: string;
  actionId?: string;
}
```
**Ack / response:** `{ roomCode: string, token: string, participant: Participant, isReconnect: boolean }`

#### `room:leave`
Leaves the room and releases any held spectator slot.

---

### Seat & Role Management

#### `seat:sit`
Takes a specific player seat (1..7).
```ts
{ seat: number; actionId?: string }
```

#### `seat:stand`
Vacates the current seat (reverting to spectator or host).
```ts
{ actionId?: string }
```

#### `host:setDealer`
Assigns or replaces the human Dealer (only allowed between rounds).
```ts
{ targetId: string; actionId?: string }
```

#### `host:assignSeat`
Host seats or unseats a participant.
```ts
{ targetId: string; seat: number | null; actionId?: string }
```

#### `host:kick`
Kicks and bans a participant from the room.
```ts
{ targetId: string; actionId?: string }
```

#### `host:transferHost`
Transfers the room host role to another connected participant.
```ts
{ targetId: string; actionId?: string }
```

---

### Host Chip & Game Session Controls

#### `host:startSession`
Starts the session from the lobby once a dealer and >=1 player are seated.

#### `host:pause` / `host:resume`
Pauses or resumes the session, freezing deadlines.

#### `host:endSession`
Ends the session and returns table to lobby.

#### `host:adjustChips`
Adjusts a participant's stack or the dealer bank (publicly logged).
```ts
{
  target: string; // playerId or "dealer"
  op: "set" | "add" | "subtract";
  amount: number;
  actionId?: string;
}
```

#### `host:updateConfig`
Updates table configuration (immediate between rounds, queued mid-round).
```ts
{ config: Partial<RoomConfig>; actionId?: string }
```

#### `host:approveRebuy`
Host approves a pending rebuy request.
```ts
{ targetId: string; actionId?: string }
```

---

### Betting Actions

- `bet:add { amount: number; actionId?: string }` — add chips to pending bet
- `bet:undo { actionId?: string }` — undo last chip
- `bet:clear { actionId?: string }` — clear pending bet
- `bet:repeat { actionId?: string }` — repeat previous round's bet
- `bet:lock { actionId?: string }` — confirm and lock bet (chips deducted)
- `bet:sitOut { actionId?: string }` — sit out the current round

---

### Dealer Actions

- `dealer:deal { actionId?: string }` — deal initial cards (when >=1 bet locked)
- `dealer:reveal { actionId?: string }` — reveal hole card and trigger dealer play
- `dealer:draw { actionId?: string }` — manual draw (manual mode only)
- `dealer:nextRound { actionId?: string }` — advance to next round
- `dealer:shuffle { actionId?: string }` — manual reshuffle

---

### Player Actions

- `play:hit { handId: string; actionId?: string }`
- `play:stand { handId: string; actionId?: string }`
- `play:double { handId: string; actionId?: string }`
- `play:split { handId: string; actionId?: string }`
- `play:insurance { handId: string; accept: boolean; actionId?: string }`
- `rebuy:request { actionId?: string }`

---

### Chat

#### `chat:send`
Sends a text chat message (rate-limited to 5 msgs in 5s; max 300 chars).
```ts
{ text: string; actionId?: string }
```

---

## Server → Client Messages

### `snapshot`
Full viewer-filtered state (sent on join, reconnect, and major state changes).
```ts
{
  type: "snapshot",
  seq: number,
  data: ClientGameView,
  chatLog: ChatMessage[],
  activityLog: ActivityEntry[]
}
```

### `events`
Ordered batch of game animation and engine events.
```ts
{
  type: "events",
  seq: number,
  events: GameEvent[]
}
```

### `presence`
Connection status updates.
```ts
{
  type: "presence",
  playerId: string,
  isConnected: boolean
}
```

### `chat`
Incoming chat message broadcast.
```ts
{
  type: "chat",
  message: {
    seq: number,
    ts: number,
    senderId: string,
    senderName: string,
    text: string
  }
}
```

### `activity`
Activity log entry.
```ts
{
  type: "activity",
  entry: {
    seq: number,
    ts: number,
    text: string
  }
}
```

### `error`
Coded error emitted when an intent is rejected.
```ts
{
  type: "error",
  code: string,
  message: string,
  actionId?: string
}
```

---

## Error Codes

| Code | Meaning |
|---|---|
| `WRONG_PHASE` | Action not allowed in current phase |
| `NOT_YOUR_TURN` | Action attempted out of turn |
| `ILLEGAL_ACTION` | General invalid request / parameter violation |
| `BANK_CANNOT_COVER` | Action exceeds dealer bank liability |
| `INSUFFICIENT_FUNDS` | Player does not have enough chips |
| `BET_TOO_LOW` | Bet below `config.minBet` |
| `BET_TOO_HIGH` | Bet above `config.maxBet` |
| `NOT_HOST` | Only host can perform this action |
| `NOT_DEALER` | Only dealer can perform this action |
| `KICKED` | Player was kicked by host |
| `BANNED` | Player token is banned from this room |
| `SPECTATOR_CHAT_DISABLED` | Spectator attempted chat when disabled |
