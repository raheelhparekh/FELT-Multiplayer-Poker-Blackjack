import { TIMING } from "./constants/timing.js";
import { createInitialState } from "./engine/factory.js";
import { computeLegalActions } from "./engine/legal.js";
import { reduce } from "./engine/reduce.js";
import type { GameAction, GameEvent } from "./engine/actions.js";
import type { GameState } from "./engine/state.js";
import type { ClientGameView } from "./engine/view-for.js";
import { scanForLeaks, viewFor } from "./engine/view-for.js";
import type { GameModule, StandingsRow, TimerSpec } from "./game-module.js";
import { defaultRoomConfig, RoomConfigSchema, type RoomConfig } from "./types/config.js";
import type { Participant } from "./types/domain.js";

export const BlackjackModule: GameModule<
  RoomConfig,
  GameState,
  GameAction,
  GameEvent,
  ClientGameView
> = {
  id: "blackjack",
  configSchema: RoomConfigSchema,
  defaultConfig: defaultRoomConfig(),

  createState(roomCode: string, config: RoomConfig): GameState {
    return createInitialState(roomCode, config);
  },

  reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
    return reduce(state, action);
  },

  legalActions(state: GameState, playerId: string): string[] {
    if (state.phase === "player_turns" && state.activeHandId) {
      const hand = state.hands.find((h) => h.id === state.activeHandId && h.playerId === playerId);
      if (hand) {
        return computeLegalActions(state, hand);
      }
    }
    return [];
  },

  viewFor(state: GameState, viewerId: string): ClientGameView {
    return viewFor(state, viewerId);
  },

  timerSpec(state: GameState): TimerSpec[] {
    const specs: TimerSpec[] = [];
    if (state.isPaused) return specs;

    if (state.phase === "betting" && state.config.betTimerSec) {
      specs.push({
        name: "betTimer",
        durationMs: state.config.betTimerSec * 1000,
      });
    } else if (state.phase === "player_turns" && state.activeHandId && state.config.actionTimerSec) {
      const activeHand = state.hands.find((h) => h.id === state.activeHandId);
      if (activeHand) {
        specs.push({
          name: "actionTimer",
          durationMs: state.config.actionTimerSec * 1000,
          playerId: activeHand.playerId,
        });
      }
    } else if (state.phase === "insurance" && state.insurancePending.size > 0) {
      specs.push({
        name: "insuranceTimer",
        durationMs: TIMING.INSURANCE_TIMER_MS,
      });
    }

    return specs;
  },

  onTimeout(state: GameState, playerId: string): GameAction | null {
    if (state.phase === "player_turns" && state.activeHandId) {
      return { type: "play:stand", playerId, handId: state.activeHandId };
    }
    if (state.phase === "insurance") {
      const hand = state.hands.find((h) => h.playerId === playerId);
      if (hand) {
        return { type: "play:insurance", playerId, handId: hand.id, accept: false };
      }
    }
    return null;
  },

  onDisconnect(state: GameState, playerId: string): GameAction | null {
    if (state.phase === "player_turns" && state.activeHandId) {
      const hand = state.hands.find((h) => h.id === state.activeHandId && h.playerId === playerId);
      if (hand) {
        return { type: "play:stand", playerId, handId: hand.id };
      }
    }
    return null;
  },

  standings(state: GameState, participants: Map<string, Participant>): StandingsRow[] {
    const rows: StandingsRow[] = [];
    for (const [playerId, p] of participants) {
      const stack = state.stacks.get(playerId) ?? 0;
      const totalBuyIn = state.totalBuyIns.get(playerId) ?? state.config.startingStack;
      rows.push({
        playerId,
        displayName: p.displayName,
        avatarId: p.avatarId,
        stack,
        totalBuyIn,
        net: stack - totalBuyIn,
        roundsOrHandsPlayed: state.roundNumber,
      });
    }
    return rows.sort((a, b) => b.net - a.net);
  },

  invariants(state: GameState): string[] {
    const violations: string[] = [];
    const playerStacksSum = [...state.stacks.values()].reduce((a, b) => a + b, 0);
    const lockedBetsSum = [...state.lockedBets.values()].reduce((a, b) => a + b, 0);
    const pendingBetsSum = [...state.pendingBets.values()].reduce((a, b) => a + b, 0);

    for (const [pid, stack] of state.stacks) {
      if (stack < 0) violations.push(`Negative stack for player ${pid}: ${stack}`);
    }
    if (state.dealerBank < 0) {
      violations.push(`Negative dealer bank: ${state.dealerBank}`);
    }

    const totalChips = playerStacksSum + lockedBetsSum + pendingBetsSum + state.dealerBank;
    if (isNaN(totalChips)) {
      violations.push("Total chips evaluated to NaN");
    }

    return violations;
  },

  scanForLeaks(view: ClientGameView, state?: GameState): string[] {
    return scanForLeaks(view, state);
  },
};
