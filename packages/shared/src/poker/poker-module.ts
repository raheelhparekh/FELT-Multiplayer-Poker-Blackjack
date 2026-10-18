import type { GameModule, StandingsRow, TimerSpec } from "../game-module.js";
import type { Participant } from "../types/domain.js";
import type { PokerAction, PokerEvent } from "./actions.js";
import { defaultPokerConfig, PokerConfigSchema, type PokerConfig } from "./config.js";
import { reduce } from "./reduce.js";
import type { PokerState } from "./state.js";
import { scanForPokerLeaks, viewFor, type ClientPokerGameView } from "./view-for.js";

export function createInitialPokerState(roomCode: string, config: PokerConfig = defaultPokerConfig()): PokerState {
  return {
    roomCode,
    config,
    phase: "lobby",
    street: null,
    handNumber: 0,

    dealerButtonSeat: 1,
    smallBlindSeat: null,
    bigBlindSeat: null,

    deck: [],
    communityCards: [],
    burnedCards: [],

    pots: [],
    currentBet: 0,
    lastFullRaiseSize: config.bigBlind,
    toActPlayerId: null,

    players: new Map(),
    participants: new Map(),
    seatedPlayers: new Map(),
    stacks: new Map(),
    totalBuyIns: new Map(),
    initialBuyIns: new Map(),
    rebuys: new Map(),
    sittingOut: new Set(),

    actionDeadline: null,
    handSummaryDeadline: null,
    pausedRemainingMs: null,

    winners: null,
    handHistory: [],

    seq: 0,
    isSessionStarted: false,
    isPaused: false,
    tableStatusMessage: null,
  };
}

export const PokerModule: GameModule<
  PokerConfig,
  PokerState,
  PokerAction,
  PokerEvent,
  ClientPokerGameView
> = {
  id: "poker",
  configSchema: PokerConfigSchema,
  defaultConfig: defaultPokerConfig(),

  createState(roomCode: string, config: PokerConfig): PokerState {
    return createInitialPokerState(roomCode, config);
  },

  reduce(state: PokerState, action: PokerAction): { state: PokerState; events: PokerEvent[] } {
    return reduce(state, action);
  },

  legalActions(state: PokerState, playerId: string): string[] {
    const view = viewFor(state, playerId);
    return view.myLegalActions;
  },

  viewFor(state: PokerState, viewerId: string): ClientPokerGameView {
    return viewFor(state, viewerId);
  },

  timerSpec(state: PokerState): TimerSpec[] {
    const specs: TimerSpec[] = [];
    if (state.isPaused) return specs;

    if (state.phase === "betting" && state.toActPlayerId && state.config.actionTimerSec) {
      specs.push({
        name: "actionTimer",
        durationMs: state.config.actionTimerSec * 1000,
        playerId: state.toActPlayerId,
      });
    } else if (state.phase === "hand_summary" && state.config.autoNextHandDelaySec) {
      specs.push({
        name: "nextHandTimer",
        durationMs: state.config.autoNextHandDelaySec * 1000,
      });
    }

    return specs;
  },

  onTimeout(state: PokerState, playerId: string): PokerAction | null {
    if (state.phase === "betting" && state.toActPlayerId === playerId) {
      const player = state.players.get(playerId);
      if (player && state.currentBet === player.committedThisRound) {
        return { type: "poker:check", playerId };
      }
      return { type: "poker:fold", playerId };
    }
    if (state.phase === "hand_summary") {
      return { type: "poker:nextHand" };
    }
    return null;
  },

  onDisconnect(state: PokerState, playerId: string): PokerAction | null {
    if (state.phase === "betting" && state.toActPlayerId === playerId) {
      return { type: "poker:fold", playerId };
    }
    return null;
  },

  standings(state: PokerState, participants: Map<string, Participant>): StandingsRow[] {
    const rows: StandingsRow[] = [];
    for (const [playerId, p] of participants) {
      const player = state.players.get(playerId);
      const stack = player?.stack ?? state.config.minBuyIn;
      const totalBuyIn = state.totalBuyIns.get(playerId) ?? state.config.minBuyIn;
      rows.push({
        playerId,
        displayName: p.displayName,
        avatarId: p.avatarId,
        stack,
        totalBuyIn,
        net: stack - totalBuyIn,
        roundsOrHandsPlayed: state.handNumber,
      });
    }
    return rows.sort((a, b) => b.net - a.net);
  },

  invariants(state: PokerState): string[] {
    const violations: string[] = [];

    // Chip conservation: sum(stacks) + sum(committedThisRound) + (pots during active hand)
    let totalChips = 0;
    for (const [pid, p] of state.players) {
      if (p.stack < 0) violations.push(`Negative stack for player ${pid}: ${p.stack}`);
      totalChips += p.stack + p.committedThisRound;
    }
    if (state.phase !== "hand_summary") {
      for (const pot of state.pots) {
        if (pot.amount < 0) violations.push(`Negative pot amount: ${pot.amount}`);
        totalChips += pot.amount;
      }
    }

    if (isNaN(totalChips)) {
      violations.push("Total poker chips evaluated to NaN");
    }

    return violations;
  },

  scanForLeaks(view: ClientPokerGameView, state?: PokerState): string[] {
    return scanForPokerLeaks(view, state);
  },
};
