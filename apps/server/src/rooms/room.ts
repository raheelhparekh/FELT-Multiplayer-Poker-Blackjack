import { randomUUID } from "node:crypto";
import type {
  ActivityEntry,
  ChatMessage,
  GameAction,
  GameEvent,
  GamePhase,
  Participant,
  Role,
  RoomConfig,
  SeatNumber,
} from "@felt/shared";
import {
  CHAT,
  EngineError,
  PartialRoomConfigSchema,
  ROOM,
  TIMING,
  createInitialState,
  defaultRoomConfig,
  reduce,
  scanForLeaks,
  viewFor,
} from "@felt/shared";
import type { Socket } from "socket.io";
import { createActivityEntry, formatEventActivity } from "../activity/activity-logger.js";
import { createGuestToken, verifyGuestToken } from "../auth/token.js";

import { dbService } from "../db/index.js";
import type { NewSessionPlayerResult } from "../db/schema.js";

export interface RoomOptions {
  roomCode: string;
  config?: RoomConfig | undefined;
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
}

export class Room {
  public readonly roomCode: string;
  public readonly password?: string;
  public config: RoomConfig;
  public state: import("@felt/shared").GameState;
  public hostId = "";
  public dealerId: string | null = null;
  public pacingEnabled: boolean;
  public sessionStartedAt = Date.now();
  public roundCount = 0;
  public participants = new Map<string, Participant>();
  private sockets = new Map<string, Socket>(); // playerId → socket
  private socketToPlayer = new Map<string, string>(); // socket.id → playerId
  private playerTokens = new Map<string, string>(); // playerId → token
  private bannedTokens = new Set<string>();
  private bannedPlayerIds = new Set<string>();

  public chatLog: ChatMessage[] = [];
  public activityLog: ActivityEntry[] = [];
  private chatRateLimits = new Map<string, number[]>(); // playerId → timestamps
  private actionDeduplication = new Map<string, { timestamp: number; result?: unknown }>();

  // Timers
  private betTimer: NodeJS.Timeout | null = null;
  private actionTimer: NodeJS.Timeout | null = null;
  private insuranceTimer: NodeJS.Timeout | null = null;
  private seatHoldTimers = new Map<string, NodeJS.Timeout>();
  private emptyRoomTimer: NodeJS.Timeout | null = null;

  private onEmptyRoomDestroy?: ((code: string) => void) | undefined;
  public isDestroyed = false;

  constructor(options: RoomOptions) {
    this.roomCode = options.roomCode.toUpperCase();
    if (options.password) this.password = options.password;
    this.config = options.config ?? defaultRoomConfig();
    this.pacingEnabled = options.pacingEnabled ?? true;
    this.onEmptyRoomDestroy = options.onEmptyRoomDestroy;

    this.state = createInitialState(this.roomCode, this.config);
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

    // Sync participant to engine state bankrolls
    const stacks = new Map(this.state.stacks);
    const totalBuyIns = new Map(this.state.totalBuyIns);
    if (!stacks.has(playerId)) {
      stacks.set(playerId, this.config.startingStack);
      totalBuyIns.set(playerId, this.config.startingStack);
    }
    const stateParticipants = new Map(this.state.participants);
    stateParticipants.set(playerId, participant);
    this.state = { ...this.state, participants: stateParticipants, stacks, totalBuyIns };

    this.cancelEmptyRoomTimer();

    this.addActivity(`${participant.displayName} joined the room`);
    this.broadcastPresence(playerId, true);
    this.broadcastSnapshot();

    return { participant, token, isReconnect: false };
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

    this.cancelEmptyRoomTimer();

    // Update in engine state
    const stateParticipants = new Map(this.state.participants);
    stateParticipants.set(playerId, existing);
    this.state = { ...this.state, participants: stateParticipants };

    this.addActivity(`${existing.displayName} reconnected`);
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

    // Host auto-transfer if the host disconnected
    if (playerId === this.hostId) {
      this.autoTransferHost();
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

  public leave(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;

    const participant = this.participants.get(playerId);
    if (participant?.seat !== null) {
      // If seated, standing up frees the seat
      try {
        this.stand(playerId);
      } catch {
        // Ignore if mid-round
      }
    }

    this.handleDisconnect(socketId);
  }

  // ─── Seat Management ───────────────────────────────────────────────────────

  public sit(playerId: string, seat: number): void {
    const p = this.participants.get(playerId);
    if (!p) throw new EngineError("ILLEGAL_ACTION", "Participant not found");
    if (!p.isConnected) throw new EngineError("ILLEGAL_ACTION", "Participant is not connected");

    if (playerId === this.dealerId) {
      throw new EngineError("ILLEGAL_ACTION", "The Dealer cannot take a player seat");
    }

    if (seat < 1 || seat > this.config.maxPlayerSeats) {
      throw new EngineError(
        "ILLEGAL_ACTION",
        `Seat number must be between 1 and ${this.config.maxPlayerSeats}`,
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

    this.addActivity(`${p.displayName} sat at seat ${seat}`);
    this.broadcastSnapshot();
  }

  public stand(playerId: string): void {
    const p = this.participants.get(playerId);
    if (!p) throw new EngineError("ILLEGAL_ACTION", "Participant not found");
    if (p.seat === null) return;

    // Disallow standing mid-round if the player has active hands
    if (
      this.state.phase !== "lobby" &&
      this.state.phase !== "round_summary" &&
      this.state.phase !== "betting"
    ) {
      const hasActiveHand = this.state.hands.some((h) => h.playerId === playerId && !h.isLocked);
      if (hasActiveHand) {
        throw new EngineError("ILLEGAL_ACTION", "Cannot stand while playing an active hand");
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
    if (this.state.phase === "betting") {
      if (pendingBets.has(playerId)) {
        pendingBets = new Map(pendingBets);
        pendingBets.delete(playerId);
      }
      if (lockedBets.has(playerId)) {
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

    if (this.dealerId === targetId) {
      this.dealerId = null;
      this.state.dealerId = null;
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

  public updateConfig(hostId: string, partialConfig: Partial<RoomConfig>): void {
    this.assertHost(hostId);
    const result = PartialRoomConfigSchema.safeParse(partialConfig);
    if (!result.success) {
      throw new EngineError("ILLEGAL_ACTION", `Invalid config: ${result.error.message}`);
    }

    this.dispatchEngineAction({
      type: "host:updateConfig",
      config: partialConfig,
    });
  }

  public adjustChips(
    hostId: string,
    target: string,
    op: "set" | "add" | "subtract",
    amount: number,
  ): void {
    this.assertHost(hostId);
    this.assertBetweenRounds();

    this.dispatchEngineAction({
      type: "host:adjustChips",
      target,
      op,
      amount,
    });
  }

  public approveRebuy(hostId: string, targetId: string): void {
    this.assertHost(hostId);
    this.assertBetweenRounds();

    this.dispatchEngineAction({
      type: "rebuy:request",
      playerId: targetId,
    });

    const target = this.participants.get(targetId);
    const name = target ? target.displayName : targetId;
    this.addActivity(`Host approved rebuy for ${name}`);
  }

  public startSession(hostId: string): void {
    this.assertHost(hostId);
    if (!this.dealerId) {
      throw new EngineError("ILLEGAL_ACTION", "Cannot start session without a Dealer assigned");
    }
    if (this.state.seatedPlayers.size < 1) {
      throw new EngineError("ILLEGAL_ACTION", "Cannot start session with no seated players");
    }

    this.sessionStartedAt = Date.now();
    this.dispatchEngineAction({ type: "host:startSession" });
    this.setupBetTimer();
  }

  public pause(hostId: string): void {
    this.assertHost(hostId);
    if (this.state.isPaused) return;

    this.state = { ...this.state, isPaused: true };
    this.addActivity("Game paused by host");
    this.broadcastSnapshot();
  }

  public resume(hostId: string): void {
    this.assertHost(hostId);
    if (!this.state.isPaused) return;

    this.state = { ...this.state, isPaused: false };
    this.addActivity("Game resumed by host");
    this.broadcastSnapshot();
  }

  public endSession(hostId: string): void {
    this.assertHost(hostId);
    this.clearAllTimers();

    // Persist session summary and player results per Brief Section 11
    const roomCode = this.roomCode;
    const startedAt = new Date(this.sessionStartedAt);
    const endedAt = new Date();
    const rounds = this.roundCount;
    const hostParticipant = this.participants.get(hostId);
    const hostUserId = hostParticipant?.userId || null;

    dbService
      .createSessionSummary({
        roomCode,
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

    this.state = { ...this.state, phase: "lobby", isSessionStarted: false };
    this.addActivity("Host ended the game session");
    this.broadcastSnapshot();
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

  public dispatch(playerId: string, action: GameAction, actionId?: string): void {
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
      case "play:hit":
      case "play:stand":
      case "play:double":
      case "play:split": {
        const activeHand = this.state.hands.find((h) => h.id === this.state.activeHandId);
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
        if (this.config.rebuyRequiresHostApproval) {
          const p = this.participants.get(playerId);
          const name = p ? p.displayName : playerId;
          this.addActivity(
            `${name} requested a rebuy (${this.config.rebuyAmount.toLocaleString()} chips)`,
          );
          this.broadcastSnapshot();
          if (actionId) this.actionDeduplication.set(actionId, { timestamp: Date.now() });
          return;
        }
        break;
      }
    }

    this.dispatchEngineAction(action);

    if (actionId) {
      this.actionDeduplication.set(actionId, { timestamp: Date.now() });
    }
  }

  private dispatchEngineAction(action: GameAction): void {
    const prevPhase = this.state.phase;
    const { state: nextState, events } = reduce(this.state, action);
    this.state = nextState;

    // Check for leak on state change (automated test / safety invariant)
    const view = viewFor(this.state, "dealer");
    const leaks = scanForLeaks(view, this.state);
    if (leaks.length > 0) {
      console.error(`[P0 LEAK DETECTED in room ${this.roomCode}]:`, leaks);
    }

    // Process activities
    for (const ev of events) {
      const act = formatEventActivity(ev, this.state, this.participants);
      if (act) this.addActivity(act);
    }

    this.broadcastEvents(events);

    // Phase transition timer updates
    this.handlePhaseTransitions(prevPhase, nextState.phase);

    this.broadcastSnapshot();
  }

  private handlePhaseTransitions(_prevPhase: GamePhase, newPhase: GamePhase): void {
    if (newPhase === "betting") {
      this.clearActionTimer();
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
      this.roundCount++;
      this.clearAllTimers();
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
    this.insuranceTimer = setTimeout(() => {
      if (this.state.phase !== "insurance") return;
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
    }, duration);
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

    const activeHand = this.state.hands.find((h) => h.id === this.state.activeHandId);
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
  }

  private clearAllTimers(): void {
    this.clearBetTimer();
    this.clearActionTimer();
    this.clearInsuranceTimer();
    for (const t of this.seatHoldTimers.values()) clearTimeout(t);
    this.seatHoldTimers.clear();
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

  public broadcastSnapshot(): void {
    for (const [playerId, socket] of this.sockets) {
      const view = viewFor(this.state, playerId);
      socket.emit("snapshot", {
        type: "snapshot",
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

  private autoTransferHost(): void {
    // Find longest-seated connected participant, or any connected participant
    const candidates = Array.from(this.participants.values()).filter(
      (p) => p.isConnected && p.id !== this.hostId,
    );

    if (candidates.length === 0) return;

    // Prefer seated player over spectator
    const nextHost = candidates.find((p) => p.seat !== null) ?? candidates[0]!;
    const oldHost = this.participants.get(this.hostId);
    if (oldHost) oldHost.isHost = false;

    nextHost.isHost = true;
    this.hostId = nextHost.id;
    this.state.hostId = nextHost.id;

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

  public serialize(): string {
    return JSON.stringify({
      roomCode: this.roomCode,
      password: this.password,
      config: this.config,
      hostId: this.hostId,
      dealerId: this.dealerId,
      pacingEnabled: this.pacingEnabled,
      sessionStartedAt: this.sessionStartedAt,
      roundCount: this.roundCount,
      state: {
        ...this.state,
        participants: Array.from(this.state.participants.entries()),
        seatedPlayers: Array.from(this.state.seatedPlayers.entries()),
        stacks: Array.from(this.state.stacks.entries()),
        totalBuyIns: Array.from(this.state.totalBuyIns.entries()),
        pendingBets: Array.from(this.state.pendingBets.entries()),
        lastBets: Array.from(this.state.lastBets.entries()),
        lockedBets: Array.from(this.state.lockedBets.entries()),
        insuranceDecisions: Array.from(this.state.insuranceDecisions.entries()),
        sittingOut: Array.from(this.state.sittingOut.values()),
        insurancePending: Array.from(this.state.insurancePending.values()),
      },
      participants: Array.from(this.participants.entries()).map(([id, p]) => [
        id,
        { ...p, isConnected: false },
      ]),
      playerTokens: Array.from(this.playerTokens.entries()),
      bannedTokens: Array.from(this.bannedTokens.values()),
      bannedPlayerIds: Array.from(this.bannedPlayerIds.values()),
      chatLog: this.chatLog,
      activityLog: this.activityLog,
    });
  }

  public static deserialize(
    jsonStr: string,
    options: { onEmptyRoomDestroy?: (code: string) => void },
  ): Room {
    const data = JSON.parse(jsonStr);
    const room = new Room({
      roomCode: data.roomCode,
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
      participants: new Map(data.participants),
      seatedPlayers: new Map(data.state.seatedPlayers),
      stacks: new Map(data.state.stacks),
      totalBuyIns: new Map(data.state.totalBuyIns),
      pendingBets: new Map(data.state.pendingBets || []),
      lastBets: new Map(data.state.lastBets || []),
      lockedBets: new Map(data.state.lockedBets || []),
      insuranceDecisions: new Map(data.state.insuranceDecisions || []),
      sittingOut: new Set(data.state.sittingOut || []),
      insurancePending: new Set(data.state.insurancePending || []),
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

    return room;
  }
}
