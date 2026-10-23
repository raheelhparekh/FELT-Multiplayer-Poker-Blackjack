import { randomUUID } from "node:crypto";
import type {
  ActivityEntry,
  ChatMessage,
  GameAction,
  PokerAction,
  GameEvent,
  GamePhase,
  Hand,
  Participant,
  PlayerTransaction,
  Role,
  RoomConfig,
  SeatNumber,
  TableNotification,
} from "@felt/shared";
import {
  CHAT,
  EngineError,
  PartialRoomConfigSchema,
  PartialPokerConfigSchema,
  type PokerConfig,
  ROOM,
  TIMING,
  createInitialState,
  defaultRoomConfig,
  getGameModule,
  reduce,
  scanForLeaks,
  viewFor,
  type GameModule,
  type GameType,
} from "@felt/shared";
import type { Socket } from "socket.io";
import { createActivityEntry, formatEventActivity } from "../activity/activity-logger.js";
import { createGuestToken, verifyGuestToken } from "../auth/token.js";

import { dbService } from "../db/index.js";
import type { NewSessionPlayerResult } from "../db/schema.js";

// ─── Active phases where chips cannot be altered immediately ─────────────────

const ACTIVE_PHASES: GamePhase[] = [
  "dealing",
  "insurance",
  "peek",
  "player_turns",
  "dealer_turn",
  "settlement",
];

// ─── Queued chip action ───────────────────────────────────────────────────────

interface QueuedChipAction {
  type: "adjustment" | "rebuy";
  target: string; // playerId or "dealer"
  op?: "set" | "add" | "subtract";
  amount: number;
  displayName: string;
  requestedAt: number;
}

export interface RoomOptions {
  roomCode: string;
  gameType?: GameType | undefined;
  gameModule?: GameModule | undefined;
  config?: any | undefined;
  password?: string | undefined;
  pacingEnabled?: boolean | undefined;
  onEmptyRoomDestroy?: ((code: string) => void) | undefined;
}

export interface JoinParams {
  displayName: string;
  avatarId: string;
  token?: string | undefined;
  password?: string | undefined;
  userId?: string | undefined;
  buyIn?: number | undefined;
}

export class Room {
  public readonly roomCode: string;
  public readonly password?: string;
  public readonly gameType: GameType;
  public readonly gameModule: GameModule;
  public config: RoomConfig;
  public state: import("@felt/shared").GameState;
  public hostId = "";
  public dealerId: string | null = null;
  public pacingEnabled: boolean;
  public sessionStartedAt = Date.now();
  public roundCount = 0;
  public participants = new Map<string, Participant>();
  public transactions: PlayerTransaction[] = [];
  private sockets = new Map<string, Socket>(); // playerId → socket
  private socketToPlayer = new Map<string, string>(); // socket.id → playerId
  private playerTokens = new Map<string, string>(); // playerId → token
  private bannedTokens = new Set<string>();
  private bannedPlayerIds = new Set<string>();

  public chatLog: ChatMessage[] = [];
  public activityLog: ActivityEntry[] = [];
  private chatRateLimits = new Map<string, number[]>(); // playerId → timestamps
  private actionDeduplication = new Map<string, { timestamp: number; result?: unknown }>();

  // ─── Queued chip actions (applied at round_summary / next betting phase) ──
  private queuedChipActions: QueuedChipAction[] = [];

  // ─── Timers ────────────────────────────────────────────────────────────────
  private betTimer: NodeJS.Timeout | null = null;
  private actionTimer: NodeJS.Timeout | null = null;
  private insuranceTimer: NodeJS.Timeout | null = null;
  private seatHoldTimers = new Map<string, NodeJS.Timeout>();
  private emptyRoomTimer: NodeJS.Timeout | null = null;
  // Grace timer for host/dealer disconnect (90s)
  private hostDealerGraceTimer: NodeJS.Timeout | null = null;
  // Per-player grace timer for active-hand disconnect (20s, timers-disabled mode only)
  private disconnectGraceTimers = new Map<string, NodeJS.Timeout>();

  private onEmptyRoomDestroy?: ((code: string) => void) | undefined;
  public isDestroyed = false;

  constructor(options: RoomOptions) {
    this.roomCode = options.roomCode.toUpperCase();
    if (options.password) this.password = options.password;
    this.gameModule = options.gameModule ?? getGameModule(options.gameType ?? "blackjack");
    this.gameType = this.gameModule.id;
    const baseConfig = this.gameModule.defaultConfig;
    this.config = options.config ? { ...baseConfig, ...options.config } : { ...baseConfig };
    this.pacingEnabled = options.pacingEnabled ?? true;
    this.onEmptyRoomDestroy = options.onEmptyRoomDestroy;

    this.state = this.gameModule.createState(this.roomCode, this.config);
  }

  // ─── Lifecycle / Sockets ───────────────────────────────────────────────────

  public join(
    socket: Socket,
    params: JoinParams,
  ): { participant: Participant; token: string; isReconnect: boolean } {
    if (this.password && params.password !== this.password) {
      throw new EngineError("ILLEGAL_ACTION", "Incorrect room password");
    }

    // Check reconnect by token
    if (params.token) {
      if (this.bannedTokens.has(params.token)) {
        throw new EngineError("ILLEGAL_ACTION", "You have been banned from this room");
      }

      const verified = verifyGuestToken(params.token);
      if (verified && verified.roomCode === this.roomCode) {
        if (this.bannedPlayerIds.has(verified.playerId)) {
          throw new EngineError("ILLEGAL_ACTION", "You have been banned from this room");
        }

        const existing = this.participants.get(verified.playerId);
        if (existing) {
          return this.reconnectParticipant(existing, socket, params.token);
        }
      }
    }

    // Check if an existing participant with same displayName or userId left and is rejoining
    const trimmedName = params.displayName.trim().toLowerCase();
    const existingByName = Array.from(this.participants.values()).find(
      (p) =>
        !p.isConnected &&
        (params.userId
          ? p.userId === params.userId
          : p.displayName.trim().toLowerCase() === trimmedName),
    );
    if (existingByName) {
      if (this.bannedPlayerIds.has(existingByName.id)) {
        throw new EngineError("ILLEGAL_ACTION", "You have been banned from this room");
      }
      const existingToken =
        this.playerTokens.get(existingByName.id) ??
        createGuestToken({
          playerId: existingByName.id,
          roomCode: this.roomCode,
          displayName: existingByName.displayName,
          avatarId: params.avatarId,
        });
      existingByName.avatarId = params.avatarId;
      return this.reconnectParticipant(existingByName, socket, existingToken);
    }

    // New participant
    const connectedSpectators = Array.from(this.participants.values()).filter(
      (p) => p.role === "spectator" && p.isConnected,
    ).length;

    if (connectedSpectators >= this.config.maxSpectators) {
      throw new EngineError("ILLEGAL_ACTION", "Room spectator capacity reached");
    }

    const playerId = randomUUID();
    const token = createGuestToken({
      playerId,
      roomCode: this.roomCode,
      displayName: params.displayName,
      avatarId: params.avatarId,
    });

    const isFirstParticipant = this.participants.size === 0;
    const isHost = isFirstParticipant;
    // First participant is automatically the host AND the dealer
    const isAutoDealer = isFirstParticipant;
    const role: Role = isHost ? "host" : "spectator";

    const participant: Participant = {
      id: playerId,
      displayName: params.displayName,
      avatarId: params.avatarId,
      role,
      seat: null,
      isConnected: true,
      isGuest: !params.userId,
      isHost,
      userId: params.userId,
    };

    if (isHost) {
      this.hostId = playerId;
      this.state.hostId = playerId;
    }

    // Auto-assign the room creator as dealer so they can start sessions immediately
    if (isAutoDealer) {
      this.dealerId = playerId;
      this.state.dealerId = playerId;
    }

    this.participants.set(playerId, participant);
    this.sockets.set(playerId, socket);
    this.socketToPlayer.set(socket.id, playerId);
    this.playerTokens.set(playerId, token);

    // Sync participant to engine state bankrolls (with custom buyIn if supplied; capped at 20,000 max)
    let initialStack: number;
    if (this.gameType === "poker") {
      const pokerCfg = this.config as unknown as PokerConfig;
      const configuredStack = (pokerCfg as any).startingStack ?? (this.config as any).startingStack;
      if (configuredStack && configuredStack > 0) {
        initialStack = configuredStack;
      } else {
        const minBuyIn = pokerCfg.minBuyIn ?? 200;
        const maxBuyIn = pokerCfg.maxBuyIn ?? 20000;
        const rawBuyIn =
          params.buyIn && params.buyIn > 0 ? params.buyIn : minBuyIn;
        initialStack = Math.min(maxBuyIn, Math.max(minBuyIn, rawBuyIn));
      }
    } else {
      const MAX_STARTING_BUY_IN = 20000;
      const rawBuyIn = params.buyIn && params.buyIn > 0 ? params.buyIn : this.config.startingStack;
      initialStack = Math.min(MAX_STARTING_BUY_IN, Math.max(100, rawBuyIn));
    }
    const stacks = new Map(this.state.stacks);
    const totalBuyIns = new Map(this.state.totalBuyIns);
    const initialBuyIns = new Map(this.state.initialBuyIns);
    const rebuys = new Map(this.state.rebuys);

    stacks.set(playerId, initialStack);
    totalBuyIns.set(playerId, initialStack);
    initialBuyIns.set(playerId, initialStack);
    rebuys.set(playerId, 0);

    const stateParticipants = new Map(this.state.participants);
    stateParticipants.set(playerId, participant);
    this.state = {
      ...this.state,
      participants: stateParticipants,
      stacks,
      totalBuyIns,
      initialBuyIns,
      rebuys,
    };

    this.addTransaction({
      id: randomUUID(),
      roundNumber: this.roundCount,
      playerId,
      displayName: participant.displayName,
      type: "buy_in",
      amount: initialStack,
      balanceAfter: initialStack,
      details: "Entered table",
      timestamp: Date.now(),
    });

    this.cancelEmptyRoomTimer();

    this.addActivity(`${participant.displayName} joined the room`);
    this.broadcastPresence(playerId, true);
    this.broadcastSnapshot();

    return { participant, token, isReconnect: false };
  }

  public addTransaction(tx: PlayerTransaction): void {
    this.transactions.push(tx);
    if (this.transactions.length > 500) {
      this.transactions.shift();
    }
  }

  private reconnectParticipant(
    existing: Participant,
    socket: Socket,
    token: string,
  ): { participant: Participant; token: string; isReconnect: boolean } {
    const playerId = existing.id;

    // Disconnect old socket if any
    const oldSocket = this.sockets.get(playerId);
    if (oldSocket && oldSocket.id !== socket.id) {
      this.socketToPlayer.delete(oldSocket.id);
      try {
        oldSocket.disconnect(true);
      } catch {
        // Ignore
      }
    }

    existing.isConnected = true;
    this.sockets.set(playerId, socket);
    this.socketToPlayer.set(socket.id, playerId);
    this.playerTokens.set(playerId, token);

    // Cancel seat hold timer if running
    const holdTimer = this.seatHoldTimers.get(playerId);
    if (holdTimer) {
      clearTimeout(holdTimer);
      this.seatHoldTimers.delete(playerId);
    }

    // Cancel per-player disconnect grace timer if running
    const graceTmr = this.disconnectGraceTimers.get(playerId);
    if (graceTmr) {
      clearTimeout(graceTmr);
      this.disconnectGraceTimers.delete(playerId);
      this.addActivity(`${existing.displayName} reconnected before auto-stand`);
    }

    this.cancelEmptyRoomTimer();

    // Update in engine state
    const stateParticipants = new Map(this.state.participants);
    stateParticipants.set(playerId, existing);
    this.state = { ...this.state, participants: stateParticipants };

    // If this reconnect resolves a host/dealer grace period, clear it
    const isReturningHost = playerId === this.hostId;
    const isReturningDealer = playerId === this.dealerId;
    if ((isReturningHost || isReturningDealer) && this.hostDealerGraceTimer) {
      clearTimeout(this.hostDealerGraceTimer);
      this.hostDealerGraceTimer = null;
      // Clear the waiting message
      this.state = { ...this.state, waitingForReconnect: null };
      this.addActivity(
        `${existing.displayName} (${isReturningHost && isReturningDealer ? "Host & Dealer" : isReturningHost ? "Host" : "Dealer"}) reconnected — game still paused, resume when ready`,
      );
    } else {
      this.addActivity(`${existing.displayName} reconnected`);
    }

    this.broadcastPresence(playerId, true);
    this.broadcastSnapshot();

    return { participant: existing, token, isReconnect: true };
  }

  public handleDisconnect(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;

    this.socketToPlayer.delete(socketId);
    this.sockets.delete(playerId);

    const participant = this.participants.get(playerId);
    if (!participant) return;

    participant.isConnected = false;

    // Update in state
    const stateParticipants = new Map(this.state.participants);
    stateParticipants.set(playerId, participant);
    this.state = { ...this.state, participants: stateParticipants };

    this.addActivity(`${participant.displayName} disconnected`);
    this.broadcastPresence(playerId, false);

    const wasHost = playerId === this.hostId;
    const wasDealer = playerId === this.dealerId;
    const isGameActive = this.state.isSessionStarted || this.state.phase !== "lobby";

    if ((wasHost || wasDealer) && isGameActive) {
      // ── New behavior: grace period instead of immediate session end ─────
      const roleStr = wasHost && wasDealer ? "Host & Dealer" : wasHost ? "Host" : "Dealer";
      this.addActivity(
        `${participant.displayName} (${roleStr}) disconnected — waiting ${ROOM.HOST_DEALER_GRACE_SECONDS}s for reconnect`,
      );

      // Auto-pause to freeze all timers
      if (!this.state.isPaused) {
        this._pauseTimers();
        this.state = {
          ...this.state,
          isPaused: true,
          waitingForReconnect: `Waiting for ${participant.displayName} (${roleStr}) to reconnect`,
          tableStatusMessage: `Waiting for ${roleStr} to reconnect`,
        };
      }

      // Start 90s grace period
      if (this.hostDealerGraceTimer) {
        clearTimeout(this.hostDealerGraceTimer);
      }
      this.hostDealerGraceTimer = setTimeout(() => {
        this._onHostDealerGraceExpired(playerId, wasHost, wasDealer);
      }, ROOM.HOST_DEALER_GRACE_SECONDS * 1000);
    } else if (wasHost && !isGameActive) {
      // In lobby, host disconnect immediately auto-transfers to next eligible player
      this.autoTransferHost(playerId);
    } else if (
      this.gameType === "poker" &&
      isGameActive &&
      this.state.phase === "betting" &&
      (this.state as any).toActPlayerId === playerId
    ) {
      if (this.config.actionTimerSec) {
        // Normal actionTimer will fire and auto-act
      } else {
        const graceTmr = setTimeout(() => {
          this._onDisconnectGraceExpired(playerId);
        }, ROOM.DISCONNECT_GRACE_SECONDS * 1000);
        this.disconnectGraceTimers.set(playerId, graceTmr);
        this.addActivity(
          `${participant.displayName}'s turn — auto-fold in ${ROOM.DISCONNECT_GRACE_SECONDS}s (disconnected)`,
        );
      }
    } else if (
      isGameActive &&
      this.state.phase === "player_turns" &&
      this.state.activeHandId !== null
    ) {
      // Active player disconnected during their turn
      const activeHand = this.state.hands?.find((h: Hand) => h.id === this.state.activeHandId);
      if (activeHand && activeHand.playerId === playerId) {
        if (this.config.actionTimerSec) {
          // Timer is enabled — normal expiry will auto-stand
          // Nothing extra needed; the existing actionTimer will fire
        } else {
          // Timer is disabled — start a 20s disconnect grace timer
          const graceTmr = setTimeout(() => {
            this._onDisconnectGraceExpired(playerId);
          }, ROOM.DISCONNECT_GRACE_SECONDS * 1000);
          this.disconnectGraceTimers.set(playerId, graceTmr);
          this.addActivity(
            `${participant.displayName}'s turn — auto-stand in ${ROOM.DISCONNECT_GRACE_SECONDS}s (disconnected)`,
          );
        }
      }
    }

    // Seat hold timer if seated
    if (participant.seat !== null) {
      const holdTimer = setTimeout(
        () => {
          this.expireSeatHold(playerId);
        },
        ROOM.SEAT_HOLD_MINUTES * 60 * 1000,
      );
      this.seatHoldTimers.set(playerId, holdTimer);
    }

    // Check if room is completely empty
    const anyConnected = Array.from(this.participants.values()).some((p) => p.isConnected);
    if (!anyConnected) {
      this.startEmptyRoomTimer();
    }

    this.broadcastSnapshot();
  }

  /** Called when the 90s host/dealer grace period expires. */
  private _onHostDealerGraceExpired(
    disconnectedId: string,
    wasHost: boolean,
    wasDealer: boolean,
  ): void {
    this.hostDealerGraceTimer = null;
    if (this.isDestroyed) return;

    const disconnectedPart = this.participants.get(disconnectedId);
    const name = disconnectedPart?.displayName ?? disconnectedId;

    // Find connected participants
    const connected = Array.from(this.participants.values()).filter(
      (p) => p.isConnected && p.id !== disconnectedId,
    );

    if (connected.length === 0) {
      // No one left — end session
      this.state = { ...this.state, waitingForReconnect: null };
      this.endSessionInternal("No participants remaining — session ended");
      this.broadcastSnapshot();
      return;
    }

    // Dealer replacement if needed
    if (wasDealer && this.dealerId === disconnectedId) {
      // Reassign dealer to host if available
      const newDealer = this.participants.get(this.hostId);
      if (newDealer?.isConnected) {
        if (newDealer.seat !== null) {
          const seat = newDealer.seat;
          newDealer.seat = null;
          const seatedPlayers = new Map(this.state.seatedPlayers);
          seatedPlayers.delete(seat);
          this.state = { ...this.state, seatedPlayers };
        }
        newDealer.role = "dealer";
        this.dealerId = newDealer.id;
        this.state.dealerId = newDealer.id;
        this.addActivity(
          `${newDealer.displayName} automatically became Dealer (previous dealer timed out)`,
        );
      } else {
        // No valid dealer — find any connected non-seated participant
        const fallback = connected.find((p) => p.seat === null && p.id !== this.hostId);
        if (fallback) {
          fallback.role = "dealer";
          this.dealerId = fallback.id;
          this.state.dealerId = fallback.id;
          this.addActivity(
            `${fallback.displayName} automatically became Dealer (previous dealer timed out)`,
          );
        }
      }
    }

    // Host transfer if needed
    if (wasHost) {
      this.autoTransferHost(disconnectedId);
    }

    const roleStr = wasHost && wasDealer ? "Host & Dealer" : wasHost ? "Host" : "Dealer";
    this.addActivity(`${name} (${roleStr}) did not reconnect — table control transferred`);

    this.state = {
      ...this.state,
      waitingForReconnect: null,
      tableStatusMessage: "Game paused — host can resume when ready",
    };

    this.broadcastSnapshot();
  }

  /** Called when the 20s disconnect grace expires for an active player (timers disabled). */
  private _onDisconnectGraceExpired(playerId: string): void {
    this.disconnectGraceTimers.delete(playerId);
    if (this.isDestroyed || this.state.isPaused) return;

    if (this.gameType === "poker") {
      const pokerState = this.state as any;
      if (pokerState.phase !== "betting" || pokerState.toActPlayerId !== playerId) return;
      const timeoutAction = this.gameModule.onDisconnect(this.state, playerId);
      if (timeoutAction) {
        try {
          this.dispatchEngineAction(timeoutAction);
        } catch {
          // Ignore
        }
      }
      return;
    }

    if (this.state.phase !== "player_turns" || !this.state.activeHandId) return;

    const activeHand = this.state.hands?.find((h: Hand) => h.id === this.state.activeHandId);
    if (!activeHand || activeHand.playerId !== playerId) return;

    const p = this.participants.get(playerId);
    const name = p?.displayName ?? playerId;
    this.addActivity(`Auto-standing ${name}'s hand (disconnected, grace period expired)`);

    try {
      this.dispatchEngineAction({
        type: "play:stand",
        playerId,
        handId: activeHand.id,
      });
    } catch {
      // Ignore engine errors
    }
  }

  public leave(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;

    const participant = this.participants.get(playerId);
    if (participant && participant.seat !== null) {
      const seat = participant.seat;
      participant.seat = null;
      const seatedPlayers = new Map(this.state.seatedPlayers);
      seatedPlayers.delete(seat);
      this.state = { ...this.state, seatedPlayers };
    }

    this.handleDisconnect(socketId);
  }

  // ─── Seat Management ───────────────────────────────────────────────────────

  public sit(playerId: string, seat: number): void {
    const p = this.participants.get(playerId);
    if (!p) throw new EngineError("ILLEGAL_ACTION", "Participant not found");
    if (!p.isConnected) throw new EngineError("ILLEGAL_ACTION", "Participant is not connected");

    if (this.gameType === "blackjack" && playerId === this.dealerId) {
      throw new EngineError("ILLEGAL_ACTION", "The Dealer cannot take a player seat");
    }

    const maxSeats =
      this.gameType === "poker" ? ((this.config as any).maxSeats ?? 9) : this.config.maxPlayerSeats;
    if (seat < 1 || seat > maxSeats) {
      throw new EngineError(
        "ILLEGAL_ACTION",
        `Seat number must be between 1 and ${maxSeats}`,
      );
    }

    const seatNum = seat as SeatNumber;
    const currentOccupant = this.state.seatedPlayers.get(seatNum);
    if (currentOccupant && currentOccupant !== playerId) {
      throw new EngineError("ILLEGAL_ACTION", `Seat ${seat} is already occupied`);
    }

    // If seated elsewhere, unseat first
    if (p.seat !== null && p.seat !== seatNum) {
      const seatedPlayers = new Map(this.state.seatedPlayers);
      seatedPlayers.delete(p.seat);
      this.state = { ...this.state, seatedPlayers };
    }

    p.seat = seatNum;
    if (p.role === "spectator") {
      p.role = "player";
    }

    const seatedPlayers = new Map(this.state.seatedPlayers);
    seatedPlayers.set(seatNum, playerId);
    this.state = { ...this.state, seatedPlayers };

    if (this.gameType === "poker") {
      const pokerState = this.state as any;
      const initialStack =
        this.state.stacks?.get(playerId) ?? (this.config as any).startingStack ?? 1000;
      if (!pokerState.players) {
        pokerState.players = new Map();
      }
      const isMidHandJoin = pokerState.phase !== "lobby";
      if (!pokerState.players.has(playerId)) {
        pokerState.players.set(playerId, {
          id: playerId,
          seatNumber: seatNum,
          holeCards: [],
          stack: initialStack,
          committedThisRound: 0,
          committedThisHand: 0,
          hasFolded: isMidHandJoin,
          isAllIn: false,
          actedThisRound: isMidHandJoin,
          hasSeenCards: false,
        });
      } else {
        const existing = pokerState.players.get(playerId);
        existing.seatNumber = seatNum;
        if (isMidHandJoin && (!existing.holeCards || existing.holeCards.length === 0)) {
          existing.hasFolded = true;
          existing.actedThisRound = true;
        }
      }
      if (!pokerState.stacks) pokerState.stacks = new Map();
      pokerState.stacks.set(playerId, initialStack);
      if (!pokerState.totalBuyIns) pokerState.totalBuyIns = new Map();
      if (!pokerState.totalBuyIns.has(playerId)) {
        pokerState.totalBuyIns.set(playerId, initialStack);
      }
      if (!pokerState.initialBuyIns) pokerState.initialBuyIns = new Map();
      if (!pokerState.initialBuyIns.has(playerId)) {
        pokerState.initialBuyIns.set(playerId, initialStack);
      }
      if (!pokerState.rebuys) pokerState.rebuys = new Map();
      if (!pokerState.rebuys.has(playerId)) {
        pokerState.rebuys.set(playerId, 0);
      }
      pokerState.participants.set(playerId, p);
    }

    this.addActivity(`${p.displayName} sat at seat ${seat}`);
    this.broadcastSnapshot();
  }

  public stand(playerId: string): void {
    const p = this.participants.get(playerId);
    if (!p) throw new EngineError("ILLEGAL_ACTION", "Participant not found");
    if (p.seat === null) return;

    // Disallow standing mid-round if the player has active hands
    if (this.gameType === "poker") {
      const pokerPlayer = (this.state as any).players?.get(playerId);
      if (
        pokerPlayer &&
        !pokerPlayer.hasFolded &&
        (this.state.phase as string) !== "lobby" &&
        (this.state.phase as string) !== "hand_summary"
      ) {
        throw new EngineError("ILLEGAL_ACTION", "Cannot stand while playing an active hand");
      }
      (this.state as any).players?.delete(playerId);
    } else {
      if (
        this.state.phase !== "lobby" &&
        this.state.phase !== "round_summary" &&
        this.state.phase !== "betting"
      ) {
        const hasActiveHand = this.state.hands?.some(
          (h: Hand) => h.playerId === playerId && !h.isLocked,
        );
        if (hasActiveHand) {
          throw new EngineError("ILLEGAL_ACTION", "Cannot stand while playing an active hand");
        }
      }
    }

    const previousSeat = p.seat;
    const seatedPlayers = new Map(this.state.seatedPlayers);
    seatedPlayers.delete(previousSeat);

    p.seat = null;
    if (p.role === "player") {
      p.role = p.isHost ? "host" : "spectator";
    }

    // Clear any pending bets if standing during betting
    let pendingBets = this.state.pendingBets;
    let lockedBets = this.state.lockedBets;
    if (this.state.phase === "betting" && this.gameType === "blackjack") {
      if (pendingBets?.has(playerId)) {
        pendingBets = new Map(pendingBets);
        pendingBets.delete(playerId);
      }
      if (lockedBets?.has(playerId)) {
        // Return chips to stack
        const locked = lockedBets.get(playerId)!;
        const stacks = new Map(this.state.stacks);
        stacks.set(playerId, (stacks.get(playerId) ?? 0) + locked);
        lockedBets = new Map(lockedBets);
        lockedBets.delete(playerId);
        this.state = { ...this.state, stacks, lockedBets };
      }
    }

    this.state = { ...this.state, seatedPlayers, pendingBets };
    this.addActivity(`${p.displayName} stood up from seat ${previousSeat}`);
    this.broadcastSnapshot();
  }

  // ─── Host Controls ─────────────────────────────────────────────────────────

  public setDealer(hostId: string, targetId: string): void {
    this.assertHost(hostId);
    this.assertBetweenRounds();

    const target = this.participants.get(targetId);
    if (!target) throw new EngineError("ILLEGAL_ACTION", "Target user not found");

    if (target.seat !== null) {
      this.stand(targetId);
    }

    if (this.dealerId && this.dealerId !== targetId) {
      const prevDealer = this.participants.get(this.dealerId);
      if (prevDealer && prevDealer.role === "dealer") {
        prevDealer.role = prevDealer.isHost ? "host" : "spectator";
      }
    }

    target.role = "dealer";
    this.dealerId = targetId;
    this.state.dealerId = targetId;

    this.addActivity(`${target.displayName} is now the Dealer`);
    this.broadcastSnapshot();
  }

  public assignSeat(hostId: string, targetId: string, seat: number | null): void {
    this.assertHost(hostId);

    const target = this.participants.get(targetId);
    if (!target) throw new EngineError("ILLEGAL_ACTION", "Target user not found");

    if (seat === null) {
      this.stand(targetId);
      return;
    }

    this.sit(targetId, seat);
  }

  public kick(hostId: string, targetId: string): void {
    this.assertHost(hostId);
    if (targetId === hostId) {
      throw new EngineError("ILLEGAL_ACTION", "Host cannot kick themselves");
    }

    const target = this.participants.get(targetId);
    if (!target) throw new EngineError("ILLEGAL_ACTION", "Target user not found");

    // Ban token and player ID
    const token = this.playerTokens.get(targetId);
    if (token) this.bannedTokens.add(token);
    this.bannedPlayerIds.add(targetId);

    // Vacate seat if seated
    if (target.seat !== null) {
      try {
        this.stand(targetId);
      } catch {
        const seatedPlayers = new Map(this.state.seatedPlayers);
        seatedPlayers.delete(target.seat);
        this.state = { ...this.state, seatedPlayers };
      }
    }

    const wasDealer = this.dealerId === targetId;
    if (wasDealer) {
      this.dealerId = this.hostId;
      this.state.dealerId = this.hostId;
      if (this.state.isSessionStarted || this.state.phase !== "lobby") {
        this.endSessionInternal(
          `${target.displayName} (Dealer) was kicked - session ended, returning to lobby`,
        );
      }
    }

    // Disconnect socket
    const socket = this.sockets.get(targetId);
    if (socket) {
      socket.emit("error", {
        type: "error",
        code: "KICKED",
        message: "You have been kicked by the host",
      });
      this.socketToPlayer.delete(socket.id);
      this.sockets.delete(targetId);
      socket.disconnect(true);
    }

    this.participants.delete(targetId);
    const stateParticipants = new Map(this.state.participants);
    stateParticipants.delete(targetId);
    this.state = { ...this.state, participants: stateParticipants };

    this.addActivity(`${target.displayName} was kicked by the host`);
    this.broadcastSnapshot();
  }

  public transferHost(currentHostId: string, newHostId: string): void {
    this.assertHost(currentHostId);

    const target = this.participants.get(newHostId);
    if (!target) throw new EngineError("ILLEGAL_ACTION", "Target user not found");
    if (!target.isConnected) throw new EngineError("ILLEGAL_ACTION", "Target user is disconnected");

    const currentHost = this.participants.get(currentHostId);
    if (currentHost) {
      currentHost.isHost = false;
      if (currentHost.role === "host") {
        currentHost.role = currentHost.seat !== null ? "player" : "spectator";
      }
    }

    target.isHost = true;
    if (target.role === "spectator") {
      target.role = "host";
    }

    this.hostId = newHostId;
    this.state.hostId = newHostId;

    this.addActivity(`${target.displayName} is now the host`);
    this.broadcastSnapshot();
  }

  public updateConfig(
    hostId: string,
    partialConfig: Partial<RoomConfig> | Partial<PokerConfig>,
  ): void {
    this.assertHost(hostId);

    if (this.gameType === "poker") {
      const result = PartialPokerConfigSchema.safeParse(partialConfig);
      if (!result.success) {
        throw new EngineError("ILLEGAL_ACTION", `Invalid poker config: ${result.error.message}`);
      }

      const currentPokerConfig = this.config as unknown as PokerConfig;
      const smallBlind = result.data.smallBlind ?? currentPokerConfig.smallBlind;
      const bigBlind = result.data.bigBlind ?? currentPokerConfig.bigBlind;
      const minBuyIn = result.data.minBuyIn ?? currentPokerConfig.minBuyIn;
      const maxBuyIn = result.data.maxBuyIn ?? currentPokerConfig.maxBuyIn;

      if (smallBlind >= bigBlind) {
        throw new EngineError("ILLEGAL_ACTION", "Small blind must be strictly less than big blind");
      }
      if (minBuyIn > maxBuyIn) {
        throw new EngineError("ILLEGAL_ACTION", "Min buy-in must be less than or equal to max buy-in");
      }

      const pCfg = result.data;
      const changes: string[] = [];
      if (pCfg.tableTheme && pCfg.tableTheme !== currentPokerConfig.tableTheme) {
        const themeNames: Record<string, string> = {
          "classic-green": "Monte Carlo Emerald",
          "royal-blue": "Bellagio Sapphire Blue",
          "ruby-red": "Caesars Crimson Red",
          "midnight-onyx": "Venetian Noir",
          "imperial-purple": "Crown Velvet Amethyst",
        };
        changes.push(
          `Table felt changed to ${themeNames[pCfg.tableTheme] ?? pCfg.tableTheme}`,
        );
      }
      if (
        (pCfg.smallBlind !== undefined && pCfg.smallBlind !== currentPokerConfig.smallBlind) ||
        (pCfg.bigBlind !== undefined && pCfg.bigBlind !== currentPokerConfig.bigBlind)
      ) {
        changes.push(`Blinds set to ₹${smallBlind}/₹${bigBlind}`);
      }
      if (
        (pCfg.minBuyIn !== undefined && pCfg.minBuyIn !== currentPokerConfig.minBuyIn) ||
        (pCfg.maxBuyIn !== undefined && pCfg.maxBuyIn !== currentPokerConfig.maxBuyIn)
      ) {
        changes.push(`Buy-in set to ₹${minBuyIn.toLocaleString()} - ₹${maxBuyIn.toLocaleString()}`);
      }
      if (pCfg.actionTimerSec !== undefined && pCfg.actionTimerSec !== currentPokerConfig.actionTimerSec) {
        changes.push(`Action Timer set to ${pCfg.actionTimerSec}s`);
      }
      if (pCfg.timeBankSec !== undefined && pCfg.timeBankSec !== currentPokerConfig.timeBankSec) {
        changes.push(`Time Bank set to ${pCfg.timeBankSec}s`);
      }
      if (pCfg.autoNextHandDelaySec !== undefined && pCfg.autoNextHandDelaySec !== currentPokerConfig.autoNextHandDelaySec) {
        changes.push(`Next hand delay set to ${pCfg.autoNextHandDelaySec}s`);
      }
      if (pCfg.maxPlayerSeats !== undefined && pCfg.maxPlayerSeats !== currentPokerConfig.maxPlayerSeats) {
        changes.push(`Max Seats set to ${pCfg.maxPlayerSeats}`);
      }
      if (pCfg.rebuyRequiresHostApproval !== undefined && pCfg.rebuyRequiresHostApproval !== currentPokerConfig.rebuyRequiresHostApproval) {
        changes.push(`Buy-in host approval ${pCfg.rebuyRequiresHostApproval ? "enabled" : "disabled"}`);
      }
      if (pCfg.rebuyAmount !== undefined && pCfg.rebuyAmount !== currentPokerConfig.rebuyAmount) {
        changes.push(`Rebuy Amount set to ₹${pCfg.rebuyAmount.toLocaleString()}`);
      }

      if (changes.length > 0) {
        const announcement = `Host updated table settings: ${changes.join("; ")}`;
        this.addActivity(announcement);
        this.addSystemChatMessage(announcement);
        this.broadcastTableNotification({
          id: randomUUID(),
          type: "info",
          message: announcement,
          timestamp: Date.now(),
        });
      }

      this.config = { ...this.config, ...result.data } as any;
      this.dispatchEngineAction({
        type: "host:updateConfig",
        config: result.data as any,
      });
      this.broadcastSnapshot();
      return;
    }

    const bjConfig = partialConfig as Partial<RoomConfig>;
    // Enforce 5,000 max bet cap and 20,000 chip caps
    if (bjConfig.maxBet !== undefined) {
      bjConfig.maxBet = Math.min(5000, Math.max(1, bjConfig.maxBet));
    }
    if (bjConfig.startingStack !== undefined) {
      bjConfig.startingStack = Math.min(20000, Math.max(100, bjConfig.startingStack));
    }
    if (bjConfig.rebuyAmount !== undefined) {
      bjConfig.rebuyAmount = Math.min(20000, Math.max(100, bjConfig.rebuyAmount));
    }

    const result = PartialRoomConfigSchema.safeParse(bjConfig);
    if (!result.success) {
      throw new EngineError("ILLEGAL_ACTION", `Invalid config: ${result.error.message}`);
    }

    // Identify what changed to inform players
    const changes: string[] = [];
    if (bjConfig.tableTheme && bjConfig.tableTheme !== this.config.tableTheme) {
      const themeNames: Record<string, string> = {
        "classic-green": "Monte Carlo Emerald",
        "royal-blue": "Bellagio Sapphire Blue",
        "ruby-red": "Caesars Crimson Red",
        "midnight-onyx": "Venetian Noir",
        "imperial-purple": "Crown Velvet Amethyst",
      };
      changes.push(
        `Table felt changed to ${themeNames[bjConfig.tableTheme] ?? bjConfig.tableTheme}`,
      );
    }
    if (bjConfig.decks !== undefined && bjConfig.decks !== this.config.decks) {
      changes.push(`Decks changed to ${bjConfig.decks}`);
    }
    if (bjConfig.maxBet !== undefined && bjConfig.maxBet !== this.config.maxBet) {
      changes.push(`Max Bet set to ₹${bjConfig.maxBet.toLocaleString()}`);
    }
    if (bjConfig.minBet !== undefined && bjConfig.minBet !== this.config.minBet) {
      changes.push(`Min Bet set to ₹${bjConfig.minBet.toLocaleString()}`);
    }
    if (
      bjConfig.startingStack !== undefined &&
      bjConfig.startingStack !== this.config.startingStack
    ) {
      changes.push(`Starting Stack set to ₹${bjConfig.startingStack.toLocaleString()}`);
    }
    if (
      bjConfig.rebuyAmount !== undefined &&
      bjConfig.rebuyAmount !== this.config.rebuyAmount
    ) {
      changes.push(`Rebuy Amount set to ₹${bjConfig.rebuyAmount.toLocaleString()}`);
    }
    if (
      bjConfig.rebuyRequiresHostApproval !== undefined &&
      bjConfig.rebuyRequiresHostApproval !== this.config.rebuyRequiresHostApproval
    ) {
      changes.push(
        `Rebuy host approval ${bjConfig.rebuyRequiresHostApproval ? "enabled" : "disabled"}`,
      );
    }
    if (
      bjConfig.dealerHitsSoft17 !== undefined &&
      bjConfig.dealerHitsSoft17 !== this.config.dealerHitsSoft17
    ) {
      changes.push(
        `Dealer Rule set to ${bjConfig.dealerHitsSoft17 ? "Hits Soft 17 (H17)" : "Stands on 17 (S17)"}`,
      );
    }
    if (
      bjConfig.blackjackPayout !== undefined &&
      bjConfig.blackjackPayout !== this.config.blackjackPayout
    ) {
      changes.push(`Blackjack Payout set to ${bjConfig.blackjackPayout}`);
    }
    if (
      bjConfig.actionTimerSec !== undefined &&
      bjConfig.actionTimerSec !== this.config.actionTimerSec
    ) {
      changes.push(`Action Timer set to ${bjConfig.actionTimerSec}s`);
    }

    if (changes.length > 0) {
      const announcement = `Host updated table settings: ${changes.join("; ")}`;
      this.addActivity(announcement);
      this.addSystemChatMessage(announcement);
      this.broadcastTableNotification({
        id: randomUUID(),
        type: "info",
        message: announcement,
        timestamp: Date.now(),
      });
    }

    this.config = { ...this.config, ...result.data } as any;
    this.dispatchEngineAction({
      type: "host:updateConfig",
      config: partialConfig,
    });
    this.broadcastSnapshot();
  }

  // ─── Safe chip-affecting phases check ─────────────────────────────────────

  private isActivePlaying(): boolean {
    if (this.gameType === "poker") {
      const p = this.state.phase as string;
      return p === "dealing" || p === "betting" || p === "showdown";
    }
    return ACTIVE_PHASES.includes(this.state.phase);
  }

  public adjustChips(
    hostId: string,
    target: string,
    op: "set" | "add" | "subtract",
    amount: number,
  ): void {
    this.assertHost(hostId);

    const isDealer = target === "dealer";
    const current = isDealer ? this.state.dealerBank : (this.state.stacks.get(target) ?? 0);
    let newBal: number;
    if (op === "set") newBal = amount;
    else if (op === "add") newBal = current + amount;
    else newBal = Math.max(0, current - amount);

    const targetPart = this.participants.get(target);
    const name = targetPart ? targetPart.displayName : target === "dealer" ? "Dealer" : target;

    const isAdd = op === "add";
    const isSub = op === "subtract";

    let details = `Host added ₹${amount.toLocaleString()} chips to wallet`;
    if (isSub) details = `Host deducted ₹${amount.toLocaleString()} chips`;
    if (op === "set") details = `Host set wallet balance to ₹${amount.toLocaleString()}`;

    // Queue if mid-hand
    if (this.isActivePlaying()) {
      this.queuedChipActions.push({
        type: "adjustment",
        target,
        op,
        amount,
        displayName: name,
        requestedAt: Date.now(),
      });

      this.addActivity(`[Queued] ${details} for ${name} — will apply after this round`);
      const notif: TableNotification = {
        id: randomUUID(),
        type: "info",
        ...(target !== "dealer" ? { playerId: target } : {}),
        playerName: name,
        amount,
        message: `${name}'s chip adjustment queued — applies after round`,
        timestamp: Date.now(),
      };
      this.broadcastTableNotification(notif);
      this.broadcastSnapshot();
      return;
    }

    // Apply immediately
    this.addTransaction({
      id: randomUUID(),
      roundNumber: this.state.roundNumber,
      playerId: target,
      displayName: name,
      type: "adjustment",
      amount,
      balanceAfter: newBal,
      status: "completed",
      details,
      timestamp: Date.now(),
    });

    this.addActivity(details);

    const notifMessage = isAdd
      ? `${name} was granted ₹${amount.toLocaleString()} chips by host`
      : isSub
        ? `Host deducted ₹${amount.toLocaleString()} chips from ${name}`
        : `Host set ${name}'s balance to ₹${amount.toLocaleString()}`;

    const notif: TableNotification = {
      id: randomUUID(),
      type: isAdd ? "chip_approved" : "info",
      ...(target !== "dealer" ? { playerId: target } : {}),
      playerName: name,
      amount,
      message: notifMessage,
      timestamp: Date.now(),
    };
    this.broadcastTableNotification(notif);

    this.dispatchEngineAction({
      type: "host:adjustChips",
      target,
      op,
      amount,
    });
  }

  public approveRebuy(approverId: string, targetId: string, amount?: number): void {
    if (approverId !== this.hostId && approverId !== this.dealerId) {
      throw new EngineError("NOT_HOST", "Only the host or dealer can approve chip requests");
    }

    // Check if there is a pending chip_request
    const pendingTx = this.transactions.find(
      (tx) => tx.playerId === targetId && tx.type === "chip_request" && tx.status === "pending",
    );

    // If there is no pending request, check if a rebuy was already approved very recently
    if (!pendingTx) {
      const recentlyApproved = this.transactions.some(
        (tx) =>
          tx.playerId === targetId &&
          (tx.type === "rebuy" || (tx.type === "chip_request" && tx.status === "approved")) &&
          Date.now() - tx.timestamp < 3000,
      );
      if (recentlyApproved) {
        console.warn(`[Rebuy] Duplicate approveRebuy ignored for player ${targetId}`);
        return;
      }
    }

    const defaultRebuy = this.gameType === "poker" ? 10000 : this.config.rebuyAmount;
    const rawRebuy =
      amount && amount > 0 ? amount : pendingTx ? pendingTx.amount : ((this.config as any).rebuyAmount ?? defaultRebuy);
    const rebuyAmount = Math.min(20000, Math.max(100, rawRebuy));

    const target = this.participants.get(targetId);
    const name = target ? target.displayName : targetId;
    const currentStack = this.state.stacks.get(targetId) ?? 0;
    const newStack = currentStack + rebuyAmount;

    // Update pending chip_request status to approved in transactions
    if (pendingTx) {
      pendingTx.status = "approved";
    }

    // Queue if mid-hand
    if (this.isActivePlaying()) {
      this.queuedChipActions.push({
        type: "rebuy",
        target: targetId,
        amount: rebuyAmount,
        displayName: name,
        requestedAt: Date.now(),
      });

      this.addTransaction({
        id: randomUUID(),
        roundNumber: this.state.roundNumber,
        playerId: targetId,
        displayName: name,
        type: "chip_request",
        amount: rebuyAmount,
        balanceAfter: currentStack,
        status: "approved",
        details: "Rebuy approved — will apply after this round",
        timestamp: Date.now(),
      });

      this.addActivity(
        `Rebuy of ₹${rebuyAmount.toLocaleString()} approved for ${name} — applies after round`,
      );

      const notif: TableNotification = {
        id: randomUUID(),
        type: "info",
        playerId: targetId,
        playerName: name,
        amount: rebuyAmount,
        message: `${name}'s rebuy queued — applies after round`,
        timestamp: Date.now(),
      };
      this.broadcastTableNotification(notif);
      this.broadcastSnapshot();
      return;
    }

    // Apply immediately
    this.addTransaction({
      id: randomUUID(),
      roundNumber: this.state.roundNumber,
      playerId: targetId,
      displayName: name,
      type: "rebuy",
      amount: rebuyAmount,
      balanceAfter: newStack,
      status: "approved",
      details: "Chips approved & granted by dealer/host",
      timestamp: Date.now(),
    });

    this.dispatchEngineAction({
      type: "rebuy:request",
      playerId: targetId,
      amount: rebuyAmount,
    });

    this.addActivity(`Approved ${rebuyAmount.toLocaleString()} chips for ${name}`);

    const notif: TableNotification = {
      id: randomUUID(),
      type: "chip_approved",
      playerId: targetId,
      playerName: name,
      amount: rebuyAmount,
      message: `${name} was granted ${rebuyAmount.toLocaleString()} chips`,
      timestamp: Date.now(),
    };
    this.broadcastTableNotification(notif);
  }

  public rejectRebuy(rejectorId: string, targetId: string): void {
    if (rejectorId !== this.hostId && rejectorId !== this.dealerId) {
      throw new EngineError("NOT_HOST", "Only the host or dealer can reject chip requests");
    }

    const pendingTx = this.transactions.find(
      (tx) => tx.playerId === targetId && tx.type === "chip_request" && tx.status === "pending",
    );

    if (!pendingTx) {
      return;
    }

    pendingTx.status = "rejected";
    const target = this.participants.get(targetId);
    const name = target ? target.displayName : targetId;

    this.addActivity(`Host rejected chip request for ${name}`);

    const notif: TableNotification = {
      id: randomUUID(),
      type: "info",
      playerId: targetId,
      playerName: name,
      message: `Chip request of ₹${pendingTx.amount.toLocaleString()} was declined by host`,
      timestamp: Date.now(),
    };
    this.broadcastTableNotification(notif);
    this.broadcastSnapshot();
  }

  /** Apply all queued chip actions (called at round_summary or next betting phase). */
  private applyQueuedChipActions(): void {
    if (this.queuedChipActions.length === 0) return;

    for (const action of this.queuedChipActions) {
      try {
        if (action.type === "rebuy") {
          this.dispatchEngineAction({
            type: "rebuy:request",
            playerId: action.target,
            amount: action.amount,
          });

          const currentStack = this.state.stacks.get(action.target) ?? 0;
          this.addTransaction({
            id: randomUUID(),
            roundNumber: this.state.roundNumber,
            playerId: action.target,
            displayName: action.displayName,
            type: "rebuy",
            amount: action.amount,
            balanceAfter: currentStack,
            status: "completed",
            details: "Queued rebuy applied",
            timestamp: Date.now(),
          });
          this.addActivity(
            `Queued rebuy of ₹${action.amount.toLocaleString()} applied for ${action.displayName}`,
          );
        } else if (action.type === "adjustment" && action.op) {
          this.dispatchEngineAction({
            type: "host:adjustChips",
            target: action.target,
            op: action.op,
            amount: action.amount,
          });
          this.addActivity(
            `Queued chip adjustment applied for ${action.displayName}: ${action.op} ₹${action.amount.toLocaleString()}`,
          );
        }
      } catch (err) {
        console.warn(`[QueuedChips] Error applying queued action for ${action.target}:`, err);
      }
    }

    this.queuedChipActions = [];
  }

  public startSession(hostId: string): void {
    this.assertHost(hostId);
    if (this.gameType === "blackjack" && !this.dealerId) {
      throw new EngineError("ILLEGAL_ACTION", "Cannot start session without a Dealer assigned");
    }
    const seatedCount = this.state.seatedPlayers?.size ?? 0;
    if (this.gameType === "poker" ? seatedCount < 2 : seatedCount < 1) {
      throw new EngineError(
        "ILLEGAL_ACTION",
        this.gameType === "poker"
          ? "Need at least 2 seated players to start a poker game"
          : "Cannot start session with no seated players",
      );
    }

    this.sessionStartedAt = Date.now();
    this.dispatchEngineAction({ type: "host:startSession" });
    if (this.gameType === "blackjack") {
      this.setupBetTimer();
    } else if (this.gameType === "poker") {
      this.setupPokerActionTimer();
    }
  }

  // ─── Pause / Resume (properly freezing timers) ────────────────────────────

  public pause(hostId: string): void {
    this.assertHost(hostId);
    if (this.state.isPaused) return;

    this._pauseTimers();
    this.state = {
      ...this.state,
      isPaused: true,
      tableStatusMessage: "Game paused by host",
    };
    this.addActivity("Game paused by host");
    this.broadcastSnapshot();
  }

  /** Capture remaining ms and clear Node timers without clearing deadlines. */
  private _pauseTimers(): void {
    const now = Date.now();
    const betRemaining =
      this.betTimer && this.state.betDeadline ? Math.max(0, this.state.betDeadline - now) : null;
    const actionRemaining =
      this.actionTimer && this.state.actionDeadline
        ? Math.max(0, this.state.actionDeadline - now)
        : null;
    const insuranceRemaining =
      this.insuranceTimer && this.state.insuranceDeadline
        ? Math.max(0, this.state.insuranceDeadline - now)
        : null;

    // Clear the Node timer handles
    if (this.betTimer) {
      clearTimeout(this.betTimer);
      this.betTimer = null;
    }
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (this.insuranceTimer) {
      clearTimeout(this.insuranceTimer);
      this.insuranceTimer = null;
    }

    this.state = {
      ...this.state,
      pausedRemainingMs: {
        bet: betRemaining,
        action: actionRemaining,
        insurance: insuranceRemaining,
      },
      // Null out deadlines while paused so clients don't show a running countdown
      betDeadline: null,
      actionDeadline: null,
      insuranceDeadline: null,
    };
  }

  public resume(hostId: string): void {
    this.assertHost(hostId);
    if (!this.state.isPaused) return;

    const remaining = this.state.pausedRemainingMs;

    this.state = {
      ...this.state,
      isPaused: false,
      pausedRemainingMs: null,
      waitingForReconnect: null,
      tableStatusMessage: null,
    };

    // Restore timers from saved remaining durations
    if (remaining) {
      const now = Date.now();

      if (remaining.bet !== null) {
        if (remaining.bet <= 0) {
          // Already expired — process safe default immediately
          setTimeout(() => this.handleBetTimerExpiry(), 0);
        } else {
          this.state = { ...this.state, betDeadline: now + remaining.bet };
          this.betTimer = setTimeout(() => this.handleBetTimerExpiry(), remaining.bet);
        }
      }

      if (remaining.action !== null) {
        if (remaining.action <= 0) {
          setTimeout(() => this.handleActionTimerExpiry(), 0);
        } else {
          this.state = { ...this.state, actionDeadline: now + remaining.action };
          this.actionTimer = setTimeout(() => this.handleActionTimerExpiry(), remaining.action);
        }
      }

      if (remaining.insurance !== null) {
        if (remaining.insurance <= 0) {
          setTimeout(() => this.handleInsuranceTimerExpiry(), 0);
        } else {
          this.state = {
            ...this.state,
            insuranceDeadline: now + remaining.insurance,
          };
          this.insuranceTimer = setTimeout(
            () => this.handleInsuranceTimerExpiry(),
            remaining.insurance,
          );
        }
      }
    }

    this.addActivity("Game resumed by host");
    this.broadcastSnapshot();
  }

  // ─── Host Recovery Controls ────────────────────────────────────────────────

  /**
   * Host forces the currently active hand to stand (recovery action).
   * Allowed during any pause or active turn, even if the host is not the active player.
   */
  public forceStandActiveHand(hostId: string): void {
    this.assertHost(hostId);

    if (this.gameType === "poker") {
      const pokerState = this.state as any;
      if (pokerState.phase !== "betting" || !pokerState.toActPlayerId) {
        throw new EngineError("WRONG_PHASE", "No active turn to advance");
      }
      const targetId = pokerState.toActPlayerId;
      const p = this.participants.get(targetId);
      const name = p?.displayName ?? targetId;
      this.addActivity(`[Host Recovery] Force-advancing turn for ${name}`);
      const action = this.gameModule.onTimeout?.(this.state, targetId);
      if (action) {
        this.dispatchEngineAction(action);
      }
      return;
    }

    if (this.state.phase !== "player_turns" || !this.state.activeHandId) {
      throw new EngineError("WRONG_PHASE", "No active hand to force stand");
    }

    const activeHand = this.state.hands.find((h: Hand) => h.id === this.state.activeHandId);
    if (!activeHand) throw new EngineError("ILLEGAL_ACTION", "Active hand not found");

    const p = this.participants.get(activeHand.playerId);
    const name = p?.displayName ?? activeHand.playerId;

    this.addActivity(`[Host Recovery] Force-standing ${name}'s hand`);

    // Temporarily lift pause to allow the engine action
    const wasPaused = this.state.isPaused;
    if (wasPaused) {
      this.state = { ...this.state, isPaused: false };
    }

    try {
      this.dispatchEngineAction({
        type: "play:stand",
        playerId: activeHand.playerId,
        handId: activeHand.id,
      });
    } finally {
      if (wasPaused) {
        this.state = { ...this.state, isPaused: true };
      }
    }
  }

  /**
   * Host cancels the current round and refunds all bets.
   * Returns the table to the betting phase without incrementing round count.
   */
  public cancelRoundRefund(hostId: string): void {
    this.assertHost(hostId);

    if (this.gameType === "poker") {
      const pokerState = this.state as any;
      if (pokerState.phase === "lobby") {
        throw new EngineError("WRONG_PHASE", "No hand in progress to cancel");
      }
      this._clearGameTimers();
      const stacks = new Map(this.state.stacks);
      const players = new Map<string, any>(pokerState.players || []);
      for (const [pid, p] of players.entries()) {
        const player = { ...(p as object) } as any;
        const refund = (player.committedThisHand || 0) + (player.committedThisRound || 0);
        if (refund > 0) {
          stacks.set(pid, (stacks.get(pid) ?? 0) + refund);
          player.stack = (player.stack ?? 0) + refund;
          player.committedThisHand = 0;
          player.committedThisRound = 0;
        }
        player.holeCards = [];
        player.hasFolded = false;
        player.isAllIn = false;
        player.actedThisRound = false;
        player.hasSeenCards = false;
        players.set(pid, player);
      }

      this.state = {
        ...this.state,
        stacks,
        players,
        phase: "hand_summary",
        street: null,
        communityCards: [],
        pots: [],
        currentBet: 0,
        toActPlayerId: null,
        winners: null,
        actionDeadline: null,
        tableStatusMessage: "Hand cancelled by host — all bets refunded",
      } as any;

      this.addActivity("[Host Recovery] Hand cancelled by host — all bets refunded");
      this.broadcastSnapshot();
      return;
    }

    const phase = this.state.phase;
    const allowedPhases: GamePhase[] = [
      "betting",
      "dealing",
      "insurance",
      "peek",
      "player_turns",
      "dealer_turn",
      "settlement",
      "round_summary",
    ];
    if (!allowedPhases.includes(phase)) {
      throw new EngineError("WRONG_PHASE", "No round in progress to cancel");
    }

    // Clear active timers
    this._clearGameTimers();

    // Refund all bets (avoiding duplicate refund of lockedBets and in-play hands)
    const stacks = new Map(this.state.stacks);
    const refundedPlayers = new Set<string>();

    if (this.state.hands.length > 0) {
      for (const hand of this.state.hands) {
        if (hand.result === "pending") {
          const total = hand.bet + (hand.doubleBet || 0) + (hand.insuranceBet || 0);
          stacks.set(hand.playerId, (stacks.get(hand.playerId) ?? 0) + total);
          refundedPlayers.add(hand.playerId);
        }
      }
    }

    for (const [pid, bet] of this.state.lockedBets.entries()) {
      if (!refundedPlayers.has(pid)) {
        stacks.set(pid, (stacks.get(pid) ?? 0) + bet);
      }
    }

    this.state = {
      ...this.state,
      stacks,
      phase: "betting",
      hands: [],
      dealerHand: null,
      pendingBets: new Map(),
      lockedBets: new Map(),
      sittingOut: new Set(),
      insurancePending: new Set(),
      insuranceDecisions: new Map(),
      activeHandId: null,
      betDeadline: null,
      actionDeadline: null,
      insuranceDeadline: null,
      pausedRemainingMs: null,
      isPaused: false,
      tableStatusMessage: null,
    };

    this.addActivity("[Host Recovery] Round cancelled by host — all bets refunded");
    this.setupBetTimer();
    this.broadcastSnapshot();
  }

  /**
   * Host replaces the current dealer with another connected participant.
   * The replacement cannot be seated as a player.
   */
  public recoverDealer(hostId: string, newDealerId: string): void {
    this.assertHost(hostId);

    const newDealer = this.participants.get(newDealerId);
    if (!newDealer) throw new EngineError("ILLEGAL_ACTION", "Target user not found");
    if (!newDealer.isConnected)
      throw new EngineError("ILLEGAL_ACTION", "Target user is not connected");
    if (newDealer.seat !== null) {
      throw new EngineError("ILLEGAL_ACTION", "Replacement dealer cannot be seated as a player");
    }

    // Demote existing dealer
    if (this.dealerId && this.dealerId !== newDealerId) {
      const old = this.participants.get(this.dealerId);
      if (old && old.role === "dealer") {
        old.role = old.isHost ? "host" : "spectator";
      }
    }

    newDealer.role = "dealer";
    this.dealerId = newDealerId;
    this.state.dealerId = newDealerId;

    this.addActivity(`[Host Recovery] ${newDealer.displayName} is now the Dealer`);
    this.broadcastSnapshot();
  }

  /**
   * Host closes the table: ends any active session, removes all participants, and
   * destroys the room. Sends a "room:closed" message to all connected clients first.
   */
  public closeTable(hostId: string): void {
    this.assertHost(hostId);

    // End session if active
    if (this.state.isSessionStarted) {
      this.endSessionInternal("Host closed the table");
    }

    // Notify all connected clients before disconnecting
    for (const socket of this.sockets.values()) {
      try {
        socket.emit("room:closed", {
          type: "room:closed",
          reason: "Host closed the table",
        });
      } catch {
        // Ignore
      }
    }

    this.addActivity("Host closed the table");

    // Remove from room manager immediately
    if (this.onEmptyRoomDestroy) {
      this.onEmptyRoomDestroy(this.roomCode);
    }

    // Defer socket teardown slightly so ack and room:closed flush cleanly
    setTimeout(() => {
      this.destroy();
    }, 50);
  }

  public endSession(hostId: string): void {
    this.assertHost(hostId);
    this.endSessionInternal("Host ended the game session");
    this.broadcastSnapshot();
  }

  private endSessionInternal(reason?: string): void {
    this._clearGameTimers();

    // Refund any chips that were in locked bets or pending in-play hands
    const stacks = new Map(this.state.stacks);
    const refundedPlayers = new Set<string>();

    if (this.state.hands.length > 0) {
      for (const hand of this.state.hands) {
        if (hand.result === "pending") {
          const inPlay = hand.bet + (hand.doubleBet || 0) + (hand.insuranceBet || 0);
          stacks.set(hand.playerId, (stacks.get(hand.playerId) ?? 0) + inPlay);
          refundedPlayers.add(hand.playerId);
        }
      }
    }

    for (const [pid, bet] of this.state.lockedBets.entries()) {
      if (!refundedPlayers.has(pid)) {
        stacks.set(pid, (stacks.get(pid) ?? 0) + bet);
      }
    }

    this.state = {
      ...this.state,
      stacks,
      phase: "lobby",
      isSessionStarted: false,
      isPaused: false,
      hands: [],
      dealerHand: null,
      pendingBets: new Map(),
      lockedBets: new Map(),
      sittingOut: new Set(),
      insurancePending: new Set(),
      insuranceDecisions: new Map(),
      activeHandId: null,
      betDeadline: null,
      actionDeadline: null,
      insuranceDeadline: null,
      pausedRemainingMs: null,
      tableStatusMessage: null,
      waitingForReconnect: null,
    };

    // Persist session summary and player results per Brief Section 11
    const roomCode = this.roomCode;
    const startedAt = new Date(this.sessionStartedAt);
    const endedAt = new Date();
    const rounds = this.roundCount;
    const hostParticipant = this.hostId ? this.participants.get(this.hostId) : undefined;
    const hostUserId = hostParticipant?.userId || null;

    dbService
      .createSessionSummary({
        roomCode,
        gameType: this.gameType,
        startedAt,
        endedAt,
        rounds,
        hostUserId,
      })
      .then((summary) => {
        const playerResults: NewSessionPlayerResult[] = [];
        for (const p of this.participants.values()) {
          const stack = this.state.stacks.get(p.id) ?? this.config.startingStack;
          const totalBuyIn = this.state.totalBuyIns.get(p.id) ?? this.config.startingStack;
          const net = stack - totalBuyIn;
          playerResults.push({
            sessionId: summary.id,
            userId: p.userId || null,
            displayName: p.displayName,
            totalBuyIn,
            finalStack: stack,
            net,
            roundsPlayed: rounds,
          });
        }
        return dbService.createSessionPlayerResults(playerResults);
      })
      .catch(() => {
        // Non-blocking background persistence
      });

    dbService.deleteRoomSnapshot(this.roomCode).catch(() => {});
    this.addActivity(reason ?? "Host ended the game session");
  }

  public claimUser(playerId: string, userId: string): void {
    const participant = this.participants.get(playerId);
    if (participant) {
      participant.userId = userId;
      participant.isGuest = false;
      this.broadcastSnapshot();
    }
  }

  // ─── In-Game Actions / Dispatch ───────────────────────────────────────────

  public dispatch(playerId: string, action: GameAction | PokerAction, actionId?: string): void {
    if (actionId) {
      const cached = this.actionDeduplication.get(actionId);
      if (cached && Date.now() - cached.timestamp < 60_000) {
        return; // Idempotent duplicate
      }
    }

    if (this.state.isPaused) {
      throw new EngineError("ILLEGAL_ACTION", "Game is currently paused");
    }

    // Role verification per action
    switch (action.type) {
      case "dealer:deal":
      case "dealer:reveal":
      case "dealer:draw":
      case "dealer:shuffle": {
        if (playerId !== this.dealerId && playerId !== this.hostId) {
          throw new EngineError("NOT_DEALER", "Only the dealer or host can perform dealer actions");
        }
        break;
      }
      case "dealer:nextRound": {
        if (playerId !== this.dealerId && playerId !== this.hostId) {
          throw new EngineError(
            "NOT_DEALER",
            "Only the dealer or host can advance to the next round",
          );
        }
        break;
      }
      case "poker:dealNextStreet":
      case "poker:nextHand":
      case "poker:startHand": {
        if (playerId !== this.dealerId && playerId !== this.hostId) {
          throw new EngineError("NOT_DEALER", "Only the dealer or host can perform this action");
        }
        break;
      }
      case "poker:fold":
      case "poker:check":
      case "poker:call":
      case "poker:bet":
      case "poker:raise":
      case "poker:allIn":
      case "poker:showCards":
      case "poker:seeCards":
      case "poker:sitOut":
      case "poker:sitIn": {
        if ((action as any).playerId !== playerId) {
          throw new EngineError(
            "ILLEGAL_ACTION",
            "Cannot perform poker actions on behalf of another player",
          );
        }
        break;
      }
      case "play:hit":
      case "play:stand":
      case "play:double":
      case "play:split": {
        const activeHand = this.state.hands.find((h: Hand) => h.id === this.state.activeHandId);
        if (!activeHand || activeHand.playerId !== playerId) {
          throw new EngineError("NOT_YOUR_TURN", "It is not your turn");
        }
        break;
      }
      case "bet:add":
      case "bet:undo":
      case "bet:clear":
      case "bet:repeat":
      case "bet:lock":
      case "bet:sitOut": {
        if (action.playerId !== playerId) {
          throw new EngineError("ILLEGAL_ACTION", "Cannot place bets on behalf of another player");
        }
        break;
      }
      case "rebuy:request": {
        const MAX_CHIP_REQUEST = 20000;
        if (action.amount && action.amount > MAX_CHIP_REQUEST) {
          throw new EngineError("ILLEGAL_ACTION", "Cannot request more than 20,000 chips at once");
        }
        const p = this.participants.get(playerId);
        const name = p ? p.displayName : playerId;
        const defaultRebuy = this.gameType === "poker" ? 10000 : this.config.rebuyAmount;
        const rawReq = action.amount && action.amount > 0 ? action.amount : ((this.config as any).rebuyAmount ?? defaultRebuy);
        const reqAmount = Math.min(MAX_CHIP_REQUEST, Math.max(100, rawReq));
        const currentStack = this.state.stacks.get(playerId) ?? 0;
        const roundNum = (this.state as any).handNumber ?? this.state.roundNumber ?? 0;
        const requiresApproval = this.config.rebuyRequiresHostApproval !== false;
        if (requiresApproval) {
          // Check if there is already a pending request for this player
          const existingPending = this.transactions.find(
            (tx) =>
              tx.playerId === playerId && tx.type === "chip_request" && tx.status === "pending",
          );
          if (existingPending) {
            existingPending.amount = reqAmount;
            existingPending.details = `Requested ₹${reqAmount.toLocaleString()} chips`;
          } else {
            this.addTransaction({
              id: randomUUID(),
              roundNumber: roundNum,
              playerId,
              displayName: name,
              type: "chip_request",
              amount: reqAmount,
              balanceAfter: currentStack,
              status: "pending",
              details: `Requested ₹${reqAmount.toLocaleString()} chips`,
              timestamp: Date.now(),
            });
          }

          const notif: TableNotification = {
            id: randomUUID(),
            type: "chip_request",
            playerId,
            playerName: name,
            amount: reqAmount,
            message: `${name} requested ${reqAmount.toLocaleString()} chips`,
            timestamp: Date.now(),
          };
          this.broadcastTableNotification(notif);
          this.addActivity(`${name} requested a rebuy (${reqAmount.toLocaleString()} chips)`);
          this.broadcastSnapshot();
          if (actionId) this.actionDeduplication.set(actionId, { timestamp: Date.now() });
          return;
        }

        // Auto-rebuy (when host approval is not required)
        // Queue if mid-hand; apply immediately otherwise
        if (this.isActivePlaying()) {
          this.queuedChipActions.push({
            type: "rebuy",
            target: playerId,
            amount: reqAmount,
            displayName: name,
            requestedAt: Date.now(),
          });
          this.addTransaction({
            id: randomUUID(),
            roundNumber: this.state.roundNumber,
            playerId,
            displayName: name,
            type: "chip_request",
            amount: reqAmount,
            balanceAfter: currentStack,
            status: "approved",
            details: "Auto-rebuy queued — applies after round",
            timestamp: Date.now(),
          });
          this.addActivity(`${name} rebuy queued — applies after round`);
          this.broadcastSnapshot();
          if (actionId) this.actionDeduplication.set(actionId, { timestamp: Date.now() });
          return;
        }

        const newStack = currentStack + reqAmount;
        this.addTransaction({
          id: randomUUID(),
          roundNumber: this.state.roundNumber,
          playerId,
          displayName: name,
          type: "rebuy",
          amount: reqAmount,
          balanceAfter: newStack,
          status: "completed",
          details: `Auto-rebuy: ₹${reqAmount.toLocaleString()} chips added`,
          timestamp: Date.now(),
        });

        this.dispatchEngineAction(action);

        const notif: TableNotification = {
          id: randomUUID(),
          type: "chip_approved",
          playerId,
          playerName: name,
          amount: reqAmount,
          message: `${name} auto-re-bought ${reqAmount.toLocaleString()} chips`,
          timestamp: Date.now(),
        };
        this.broadcastTableNotification(notif);
        if (actionId) this.actionDeduplication.set(actionId, { timestamp: Date.now() });
        return;
      }
    }

    this.dispatchEngineAction(action);

    if (actionId) {
      this.actionDeduplication.set(actionId, { timestamp: Date.now() });
    }
  }

  private dispatchEngineAction(action: GameAction | PokerAction): void {
    const prevPhase = this.state.phase;
    const prevActiveHandId = this.state.activeHandId;
    const prevToActPlayerId = (this.state as any).toActPlayerId;
    const { state: nextState, events } = this.gameModule.reduce(this.state, action);
    this.state = nextState;

    // Check for leak on state change (automated test / safety invariant)
    if (this.gameModule.scanForLeaks) {
      const view = this.gameModule.viewFor(this.state, "dealer");
      const leaks = this.gameModule.scanForLeaks(view, this.state);
      if (leaks.length > 0) {
        console.error(`[P0 LEAK DETECTED in room ${this.roomCode}]:`, leaks);
      }
    }

    // Process activities
    for (const ev of events) {
      const act = formatEventActivity(ev, this.state, this.participants);
      if (act) this.addActivity(act);
    }

    this.broadcastEvents(events);

    // Phase transition timer updates
    this.handlePhaseTransitions(prevPhase, nextState.phase);

    // If still in player_turns and active hand changed or player hit, restart action timer (blackjack)
    if (
      this.gameType === "blackjack" &&
      prevPhase === "player_turns" &&
      nextState.phase === "player_turns" &&
      nextState.activeHandId &&
      !this.state.isPaused
    ) {
      if (
        prevActiveHandId !== nextState.activeHandId ||
        action.type === "play:hit" ||
        action.type === "play:split"
      ) {
        this.setupActionTimer();
      }
    }

    // If still in betting and toActPlayerId changed, restart action timer (poker)
    if (
      this.gameType === "poker" &&
      prevPhase === "betting" &&
      nextState.phase === "betting" &&
      (nextState as any).toActPlayerId &&
      prevToActPlayerId !== (nextState as any).toActPlayerId &&
      !this.state.isPaused
    ) {
      this.setupPokerActionTimer();
    }

    // Update table status message after every action
    this.updateTableStatusMessage();

    this.broadcastSnapshot();
  }

  private handlePhaseTransitions(prevPhase: GamePhase, newPhase: GamePhase): void {
    if (prevPhase === newPhase) return;

    if (this.gameType === "poker") {
      const np = newPhase as string;
      if (np === "betting") {
        this.clearActionTimer();
        this.applyQueuedChipActions();
        this.setupPokerActionTimer();
      } else if (np === "hand_summary") {
        this.clearActionTimer();
        this.roundCount = (this.state as any).handNumber ?? 0;
        this.applyQueuedChipActions();
        this.setupPokerNextHandTimer();

        // Record poker hand transactions for financial ledger
        const pokerState = this.state as any;
        const winners: any[] = pokerState.winners ?? [];
        const winnerMap = new Map<string, { amount: number; handName: string }>();
        for (const w of winners) {
          const existing = winnerMap.get(w.playerId);
          if (existing) {
            existing.amount += w.amount;
          } else {
            winnerMap.set(w.playerId, { amount: w.amount, handName: w.handName });
          }
        }

        if (pokerState.players) {
          for (const [pid, p] of pokerState.players.entries()) {
            const participant = this.participants.get(pid);
            const name = participant ? participant.displayName : pid;
            const currentBalance = p.stack;
            if (this.state.stacks) {
              this.state.stacks.set(pid, currentBalance);
            }
            const winInfo = winnerMap.get(pid);
            if (winInfo) {
              this.addTransaction({
                id: randomUUID(),
                roundNumber: this.roundCount,
                playerId: pid,
                displayName: name,
                type: "round_win",
                amount: winInfo.amount,
                balanceAfter: currentBalance,
                details: `Hand #${this.roundCount} Win (${winInfo.handName})`,
                timestamp: Date.now(),
              });
            } else if (p.committedThisHand > 0) {
              this.addTransaction({
                id: randomUUID(),
                roundNumber: this.roundCount,
                playerId: pid,
                displayName: name,
                type: "round_loss",
                amount: p.committedThisHand,
                balanceAfter: currentBalance,
                details: `Hand #${this.roundCount} Pot Contribution`,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
      return;
    }

    if (newPhase === "betting") {
      this.clearActionTimer();
      // Apply any queued chip actions before starting the next betting phase
      this.applyQueuedChipActions();
      this.setupBetTimer();
    } else if (newPhase === "insurance") {
      this.clearBetTimer();
      this.setupInsuranceTimer();
    } else if (newPhase === "player_turns") {
      this.clearBetTimer();
      this.clearInsuranceTimer();
      this.setupActionTimer();
    } else if (newPhase === "dealer_turn") {
      this.clearActionTimer();
      // Auto dealer draw mode
      if (this.config.dealerDrawMode === "auto") {
        this.runAutoDealerTurn();
      }
    } else if (newPhase === "round_summary") {
      this.roundCount = this.state.roundNumber;
      this._clearGameTimers();

      // Apply queued chip actions at round summary
      this.applyQueuedChipActions();

      for (const hand of this.state.hands) {
        const participant = this.participants.get(hand.playerId);
        const name = participant ? participant.displayName : hand.playerId;
        const totalWager = hand.bet + (hand.doubleBet || 0);
        const currentBalance = this.state.stacks.get(hand.playerId) ?? 0;
        let txType: "round_win" | "round_loss" | "round_push" = "round_loss";
        let amount = totalWager;
        let details = `Round ${this.state.roundNumber} Loss`;

        if (hand.result === "win" || hand.result === "blackjack") {
          txType = "round_win";
          details =
            hand.result === "blackjack"
              ? `Round ${this.state.roundNumber} Blackjack Win`
              : `Round ${this.state.roundNumber} Win`;
        } else if (hand.result === "push") {
          txType = "round_push";
          amount = 0;
          details = `Round ${this.state.roundNumber} Push`;
        }

        this.addTransaction({
          id: randomUUID(),
          roundNumber: this.state.roundNumber,
          playerId: hand.playerId,
          displayName: name,
          type: txType,
          amount,
          balanceAfter: currentBalance,
          details,
          timestamp: Date.now(),
        });
      }
    }
  }

  private runAutoDealerTurn(): void {
    // If pacing is enabled, do step by step with beats; otherwise execute immediately
    if (!this.pacingEnabled) {
      this.dispatchEngineAction({
        type: "dealer:reveal",
        dealerId: this.dealerId ?? this.hostId,
      });
      return;
    }

    setTimeout(() => {
      if (this.isDestroyed || this.state.phase !== "dealer_turn") return;
      this.dispatchEngineAction({
        type: "dealer:reveal",
        dealerId: this.dealerId ?? this.hostId,
      });
    }, TIMING.CARD_FLIP_MS);
  }

  // ─── Table Status Message ──────────────────────────────────────────────────

  /** Derives and sets the authoritative table status message for all clients. */
  private updateTableStatusMessage(): void {
    if (this.state.isPaused) {
      // Don't overwrite a waiting-for-reconnect message
      if (!this.state.tableStatusMessage || !this.state.waitingForReconnect) {
        this.state = { ...this.state, tableStatusMessage: "Game paused by host" };
      }
      return;
    }

    if (this.gameType === "poker") {
      const pokerState = this.state as any;
      let msg: string | null = null;
      switch (pokerState.phase) {
        case "lobby":
          msg = "Waiting for host to start poker session";
          break;
        case "dealing":
          msg = "Dealing cards…";
          break;
        case "betting": {
          const activeP = this.participants.get(pokerState.toActPlayerId);
          const name = activeP ? activeP.displayName : "player";
          msg = `Waiting for ${name} to act`;
          break;
        }
        case "showdown":
          msg = "Showdown!";
          break;
        case "hand_summary":
          msg = "Hand complete";
          break;
      }
      this.state = { ...this.state, tableStatusMessage: msg };
      return;
    }

    let msg: string | null = null;
    const phase = this.state.phase;

    switch (phase) {
      case "lobby":
        msg = "Waiting for host to start the session";
        break;
      case "betting": {
        const lockedCount = this.state.lockedBets.size;
        const seatedCount = this.state.seatedPlayers.size;
        if (lockedCount === seatedCount) {
          msg = "Waiting for dealer to deal";
        } else {
          msg = `Waiting for players to place bets (${lockedCount}/${seatedCount} ready)`;
        }
        break;
      }
      case "dealing":
        msg = "Dealing cards…";
        break;
      case "insurance": {
        const pending = this.state.insurancePending.size;
        msg =
          pending === 1
            ? "Waiting for 1 insurance decision"
            : `Waiting for ${pending} insurance decisions`;
        break;
      }
      case "peek":
        msg = "Checking for dealer blackjack…";
        break;
      case "player_turns": {
        if (this.state.activeHandId) {
          const hand = this.state.hands.find((h: Hand) => h.id === this.state.activeHandId);
          if (hand) {
            const p = this.participants.get(hand.playerId);
            const name = p?.displayName ?? hand.playerId;
            msg = `${name}'s turn`;
          }
        }
        break;
      }
      case "dealer_turn":
        msg = "Dealer is revealing cards";
        break;
      case "settlement":
        msg = "Settling hands…";
        break;
      case "round_summary": {
        const dealerName = this.dealerId
          ? (this.participants.get(this.dealerId)?.displayName ?? "Dealer")
          : "Dealer";
        msg = `Round complete — ${dealerName}, start next round`;
        break;
      }
    }

    this.state = { ...this.state, tableStatusMessage: msg };
  }

  // ─── Timers ────────────────────────────────────────────────────────────────

  private setupBetTimer(): void {
    this.clearBetTimer();
    if (!this.config.betTimerSec) return;

    this.state.betDeadline = Date.now() + this.config.betTimerSec * 1000;
    this.betTimer = setTimeout(() => {
      this.handleBetTimerExpiry();
    }, this.config.betTimerSec * 1000);
  }

  private handleBetTimerExpiry(): void {
    if (this.state.phase !== "betting") return;
    if (this.state.isPaused) return; // Safety guard

    // Sit out anyone who hasn't locked
    for (const [_seat, playerId] of this.state.seatedPlayers) {
      if (!this.state.lockedBets.has(playerId)) {
        try {
          this.dispatchEngineAction({ type: "bet:sitOut", playerId });
        } catch {
          // Ignore
        }
      }
    }

    // If at least one locked bet, dealer can deal or auto-deal
    if (this.state.lockedBets.size >= 1) {
      try {
        this.dispatchEngineAction({
          type: "dealer:deal",
          dealerId: this.dealerId ?? this.hostId,
        });
      } catch {
        // Ignore
      }
    }
  }

  private setupInsuranceTimer(): void {
    this.clearInsuranceTimer();
    const duration = TIMING.INSURANCE_TIMER_MS;
    const deadline = Date.now() + duration;
    this.state = { ...this.state, insuranceDeadline: deadline };
    this.insuranceTimer = setTimeout(() => {
      this.handleInsuranceTimerExpiry();
    }, duration);
  }

  private handleInsuranceTimerExpiry(): void {
    if (this.state.phase !== "insurance") return;
    if (this.state.isPaused) return; // Safety guard

    // Default non-respondents to No
    for (const playerId of Array.from(this.state.insurancePending)) {
      try {
        this.dispatchEngineAction({
          type: "play:insurance",
          playerId,
          handId: "",
          accept: false,
        });
      } catch {
        // Ignore
      }
    }
  }

  private setupActionTimer(): void {
    this.clearActionTimer();
    if (!this.state.activeHandId) return;

    const timerSec = this.config.actionTimerSec ?? 30;
    this.state.actionDeadline = Date.now() + timerSec * 1000;

    this.actionTimer = setTimeout(() => {
      this.handleActionTimerExpiry();
    }, timerSec * 1000);
  }

  private handleActionTimerExpiry(): void {
    if (this.state.phase !== "player_turns" || !this.state.activeHandId) return;
    if (this.state.isPaused) return; // Safety guard

    const activeHand = this.state.hands.find((h: Hand) => h.id === this.state.activeHandId);
    if (!activeHand) return;

    // Per brief: Auto-STAND on expiry, NEVER auto-hit!
    try {
      this.dispatchEngineAction({
        type: "play:stand",
        playerId: activeHand.playerId,
        handId: activeHand.id,
      });
    } catch {
      // Ignore
    }
  }

  private clearBetTimer(): void {
    if (this.betTimer) {
      clearTimeout(this.betTimer);
      this.betTimer = null;
    }
    this.state.betDeadline = null;
  }

  private clearActionTimer(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    this.state.actionDeadline = null;
  }

  private clearInsuranceTimer(): void {
    if (this.insuranceTimer) {
      clearTimeout(this.insuranceTimer);
      this.insuranceTimer = null;
    }
    this.state.insuranceDeadline = null;
  }

  private setupPokerActionTimer(): void {
    this.clearActionTimer();
    const pokerState = this.state as any;
    if (!pokerState.toActPlayerId) return;

    const timerSec = this.config.actionTimerSec ?? 30;
    pokerState.actionDeadline = Date.now() + timerSec * 1000;

    this.actionTimer = setTimeout(() => {
      this.handlePokerActionTimeout();
    }, timerSec * 1000);
  }

  private handlePokerActionTimeout(): void {
    const pokerState = this.state as any;
    if (pokerState.phase !== "betting" || !pokerState.toActPlayerId || pokerState.isPaused) return;

    const timeoutAction = this.gameModule.onTimeout(this.state, pokerState.toActPlayerId);
    if (timeoutAction) {
      try {
        this.dispatchEngineAction(timeoutAction);
      } catch {
        // Ignore
      }
    }
  }

  private setupPokerNextHandTimer(): void {
    this.clearActionTimer();
    const pokerState = this.state as any;
    const delaySec = (this.config as any).autoNextHandDelaySec ?? 5;
    if (!delaySec || delaySec <= 0) return;

    pokerState.handSummaryDeadline = Date.now() + delaySec * 1000;
    this.actionTimer = setTimeout(() => {
      if (this.isDestroyed || (this.state.phase as string) !== "hand_summary" || this.state.isPaused) return;
      try {
        this.dispatchEngineAction({ type: "poker:nextHand" });
      } catch {
        // Ignore
      }
    }, delaySec * 1000);
  }

  /** Clear only game-related timers (not seat hold, empty room, or grace timers). */
  private _clearGameTimers(): void {
    this.clearBetTimer();
    this.clearActionTimer();
    this.clearInsuranceTimer();
  }

  private clearAllTimers(): void {
    this._clearGameTimers();
    for (const t of this.seatHoldTimers.values()) clearTimeout(t);
    this.seatHoldTimers.clear();
    for (const t of this.disconnectGraceTimers.values()) clearTimeout(t);
    this.disconnectGraceTimers.clear();
    if (this.hostDealerGraceTimer) {
      clearTimeout(this.hostDealerGraceTimer);
      this.hostDealerGraceTimer = null;
    }
    this.cancelEmptyRoomTimer();
  }

  private expireSeatHold(playerId: string): void {
    this.seatHoldTimers.delete(playerId);
    const p = this.participants.get(playerId);
    if (!p || p.isConnected || p.seat === null) return;

    const seat = p.seat;
    p.seat = null;
    const seatedPlayers = new Map(this.state.seatedPlayers);
    seatedPlayers.delete(seat);
    this.state = { ...this.state, seatedPlayers };

    this.addActivity(`${p.displayName}'s seat hold expired`);
    this.broadcastSnapshot();
  }

  private startEmptyRoomTimer(): void {
    this.cancelEmptyRoomTimer();
    this.emptyRoomTimer = setTimeout(
      () => {
        if (this.onEmptyRoomDestroy) {
          this.onEmptyRoomDestroy(this.roomCode);
        }
        this.destroy();
      },
      ROOM.EMPTY_ROOM_TTL_MINUTES * 60 * 1000,
    );
  }

  private cancelEmptyRoomTimer(): void {
    if (this.emptyRoomTimer) {
      clearTimeout(this.emptyRoomTimer);
      this.emptyRoomTimer = null;
    }
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  public sendChat(playerId: string, text: string): void {
    const p = this.participants.get(playerId);
    if (!p) throw new EngineError("ILLEGAL_ACTION", "Participant not found");

    if (p.role === "spectator" && !this.config.spectatorsCanChat) {
      throw new EngineError("ILLEGAL_ACTION", "Spectator chat is disabled in this room");
    }

    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > CHAT.MAX_LENGTH) {
      throw new EngineError(
        "ILLEGAL_ACTION",
        `Chat message must be 1–${CHAT.MAX_LENGTH} characters`,
      );
    }

    // Rate limiting: max 5 messages in 5 seconds
    const now = Date.now();
    const history = this.chatRateLimits.get(playerId) ?? [];
    const validHistory = history.filter((t) => now - t < CHAT.RATE_LIMIT_WINDOW_MS);
    if (validHistory.length >= CHAT.RATE_LIMIT_COUNT) {
      throw new EngineError("ILLEGAL_ACTION", "Chat rate limit exceeded. Please wait a moment.");
    }
    validHistory.push(now);
    this.chatRateLimits.set(playerId, validHistory);

    const message: ChatMessage = {
      seq: ++this.state.seq,
      ts: now,
      senderId: playerId,
      senderName: p.displayName,
      text: trimmed,
    };

    this.chatLog.push(message);
    if (this.chatLog.length > ROOM.MAX_CHAT_LOG) {
      this.chatLog.shift();
    }

    this.broadcastMessage("chat", { type: "chat", message });
  }

  public addSystemChatMessage(text: string): void {
    const message: ChatMessage = {
      seq: ++this.state.seq,
      ts: Date.now(),
      senderId: "system",
      senderName: "Table System",
      text,
    };

    this.chatLog.push(message);
    if (this.chatLog.length > ROOM.MAX_CHAT_LOG) {
      this.chatLog.shift();
    }

    this.broadcastMessage("chat", { type: "chat", message });
  }

  // ─── Activity Log ──────────────────────────────────────────────────────────

  public addActivity(text: string): void {
    const entry = createActivityEntry(++this.state.seq, text);
    this.activityLog.push(entry);
    if (this.activityLog.length > ROOM.MAX_ACTIVITY_LOG) {
      this.activityLog.shift();
    }

    this.broadcastMessage("activity", { type: "activity", entry });
  }

  // ─── Broadcast Helpers ─────────────────────────────────────────────────────

  public broadcastTableNotification(notif: TableNotification): void {
    this.broadcastMessage("table:notification", notif);
  }

  public broadcastSnapshot(): void {
    for (const [playerId, socket] of this.sockets) {
      const view = this.gameModule.viewFor(this.state, playerId);
      view.transactions = this.transactions;
      // Include pending chip adjustment player IDs
      if (this.queuedChipActions.length > 0) {
        view.pendingChipAdjustmentPlayers = [
          ...new Set(this.queuedChipActions.map((a) => a.target)),
        ];
      }
      socket.emit("snapshot", {
        type: "snapshot",
        gameType: this.gameType,
        seq: this.state.seq,
        data: view,
        chatLog: this.chatLog,
        activityLog: this.activityLog,
      });
    }
  }

  public broadcastEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    this.broadcastMessage("events", {
      type: "events",
      seq: this.state.seq,
      events,
    });
  }

  public broadcastPresence(playerId: string, isConnected: boolean): void {
    this.broadcastMessage("presence", {
      type: "presence",
      playerId,
      isConnected,
    });
  }

  private broadcastMessage(event: string, payload: unknown): void {
    for (const socket of this.sockets.values()) {
      socket.emit(event, payload);
    }
  }

  // ─── Internal Utilities ────────────────────────────────────────────────────

  private assertHost(playerId: string): void {
    if (playerId !== this.hostId) {
      throw new EngineError("NOT_HOST", "Only the room host can perform this action");
    }
  }

  private assertBetweenRounds(): void {
    if (this.state.phase !== "lobby" && this.state.phase !== "round_summary") {
      throw new EngineError("WRONG_PHASE", "Action only permitted between rounds");
    }
  }

  private autoTransferHost(excludeId?: string): void {
    // Find longest-seated connected participant, or any connected participant
    const candidates = Array.from(this.participants.values()).filter(
      (p) => p.isConnected && p.id !== this.hostId && p.id !== excludeId,
    );

    if (candidates.length === 0) return;

    // Prefer seated player over spectator
    const nextHost = candidates.find((p) => p.seat !== null) ?? candidates[0]!;
    const oldHost = this.participants.get(this.hostId);
    if (oldHost) oldHost.isHost = false;

    nextHost.isHost = true;
    this.hostId = nextHost.id;
    this.state.hostId = nextHost.id;

    const stateParticipants = new Map(this.state.participants);
    if (oldHost) stateParticipants.set(oldHost.id, { ...oldHost });
    stateParticipants.set(nextHost.id, { ...nextHost });
    this.state = { ...this.state, participants: stateParticipants, hostId: nextHost.id };

    this.addActivity(`${nextHost.displayName} is now the host (previous host disconnected)`);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearAllTimers();
    dbService.deleteRoomSnapshot(this.roomCode).catch(() => {});
    for (const socket of this.sockets.values()) {
      try {
        socket.disconnect(true);
      } catch {
        // Ignore
      }
    }
    this.sockets.clear();
    this.socketToPlayer.clear();
    this.participants.clear();
  }

  // ─── Serialization / Snapshot ──────────────────────────────────────────────

  public serialize(): string {
    return JSON.stringify({
      _version: ROOM.SNAPSHOT_VERSION,
      roomCode: this.roomCode,
      gameType: this.gameType,
      password: this.password,
      config: this.config,
      hostId: this.hostId,
      dealerId: this.dealerId,
      pacingEnabled: this.pacingEnabled,
      sessionStartedAt: this.sessionStartedAt,
      roundCount: this.roundCount,
      state: {
        ...this.state,
        // Convert Map/Set fields to JSON-safe arrays
        participants: Array.from(this.state.participants.entries()),
        seatedPlayers: Array.from(this.state.seatedPlayers.entries()),
        stacks: Array.from(this.state.stacks.entries()),
        totalBuyIns: Array.from(this.state.totalBuyIns.entries()),
        initialBuyIns: Array.from((this.state.initialBuyIns ?? new Map()).entries()),
        rebuys: Array.from((this.state.rebuys ?? new Map()).entries()),
        pendingBets: Array.from((this.state.pendingBets ?? new Map()).entries()),
        lastBets: Array.from((this.state.lastBets ?? new Map()).entries()),
        lockedBets: Array.from((this.state.lockedBets ?? new Map()).entries()),
        insuranceDecisions: Array.from((this.state.insuranceDecisions ?? new Map()).entries()),
        sittingOut: Array.from((this.state.sittingOut ?? new Set()).values()),
        insurancePending: Array.from((this.state.insurancePending ?? new Set()).values()),
        players: Array.from((this.state as any).players?.entries() ?? []),
      },
      participants: Array.from(this.participants.entries()).map(([id, p]) => [
        id,
        { ...p, isConnected: false }, // all marked disconnected on restore
      ]),
      playerTokens: Array.from(this.playerTokens.entries()),
      bannedTokens: Array.from(this.bannedTokens.values()),
      bannedPlayerIds: Array.from(this.bannedPlayerIds.values()),
      chatLog: this.chatLog,
      activityLog: this.activityLog,
      transactions: this.transactions,
      queuedChipActions: this.queuedChipActions,
    });
  }

  public static deserialize(
    jsonStr: string,
    options: { onEmptyRoomDestroy?: (code: string) => void },
  ): Room {
    let data: ReturnType<typeof JSON.parse>;
    try {
      data = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error(`Snapshot parse error: ${err}`, { cause: err });
    }

    // Version check — future migrations would go here
    const version = data._version ?? 0;
    if (version > ROOM.SNAPSHOT_VERSION) {
      throw new Error(
        `Snapshot version ${version} is newer than supported ${ROOM.SNAPSHOT_VERSION}`,
      );
    }

    const room = new Room({
      roomCode: data.roomCode,
      gameType: data.gameType ?? "blackjack",
      password: data.password,
      config: data.config,
      pacingEnabled: data.pacingEnabled,
      onEmptyRoomDestroy: options.onEmptyRoomDestroy,
    });

    room.hostId = data.hostId;
    room.dealerId = data.dealerId;
    room.sessionStartedAt = data.sessionStartedAt;
    room.roundCount = data.roundCount ?? 0;

    room.state = {
      ...data.state,
      // Restore Map/Set fields
      participants: new Map(data.state.participants ?? data.participants),
      seatedPlayers: new Map(data.state.seatedPlayers),
      stacks: new Map(data.state.stacks),
      totalBuyIns: new Map(data.state.totalBuyIns),
      initialBuyIns: new Map(data.state.initialBuyIns || []),
      rebuys: new Map(data.state.rebuys || []),
      pendingBets: new Map(data.state.pendingBets || []),
      lastBets: new Map(data.state.lastBets || []),
      lockedBets: new Map(data.state.lockedBets || []),
      insuranceDecisions: new Map(data.state.insuranceDecisions || []),
      sittingOut: new Set(data.state.sittingOut || []),
      insurancePending: new Set(data.state.insurancePending || []),
      players: data.state.players ? new Map(data.state.players) : undefined,
      // New fields with defaults for old snapshots
      insuranceDeadline: data.state.insuranceDeadline ?? null,
      pausedRemainingMs: data.state.pausedRemainingMs ?? null,
      tableStatusMessage: data.state.tableStatusMessage ?? null,
      waitingForReconnect: null, // always cleared on restore
    };

    for (const [id, p] of data.participants) {
      room.participants.set(id, p);
    }
    for (const [id, tok] of data.playerTokens) {
      room.playerTokens.set(id, tok);
    }
    for (const tok of data.bannedTokens) {
      room.bannedTokens.add(tok);
    }
    for (const pid of data.bannedPlayerIds) {
      room.bannedPlayerIds.add(pid);
    }

    room.chatLog = data.chatLog || [];
    room.activityLog = data.activityLog || [];
    room.transactions = data.transactions || [];
    room.queuedChipActions = data.queuedChipActions || [];

    // Start empty-room timer since all participants are disconnected on restore
    room.startEmptyRoomTimer();

    // Recreate active timers if deadlines are overdue (handle them safely)
    if (room.state.isSessionStarted && !room.state.isPaused) {
      room._recreateTimersAfterRestore();
    }

    room.addActivity("Room restored from snapshot (all players marked disconnected)");

    return room;
  }

  /** After deserialization, recreate/expire overdue timers safely. */
  private _recreateTimersAfterRestore(): void {
    const now = Date.now();
    const phase = this.state.phase;

    if (phase === "betting" && this.state.betDeadline !== null) {
      const remaining = this.state.betDeadline - now;
      if (remaining <= 0) {
        // Overdue — process immediately
        setTimeout(() => this.handleBetTimerExpiry(), 0);
      } else {
        this.betTimer = setTimeout(() => this.handleBetTimerExpiry(), remaining);
      }
    } else if (phase === "insurance" && this.state.insuranceDeadline !== null) {
      const remaining = this.state.insuranceDeadline - now;
      if (remaining <= 0) {
        setTimeout(() => this.handleInsuranceTimerExpiry(), 0);
      } else {
        this.insuranceTimer = setTimeout(() => this.handleInsuranceTimerExpiry(), remaining);
      }
    } else if (phase === "player_turns" && this.state.actionDeadline !== null) {
      const remaining = this.state.actionDeadline - now;
      if (remaining <= 0) {
        setTimeout(() => this.handleActionTimerExpiry(), 0);
      } else {
        this.actionTimer = setTimeout(() => this.handleActionTimerExpiry(), remaining);
      }
    }
  }
}
