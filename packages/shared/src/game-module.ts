import type { z } from "zod";
import type { GameType, Participant } from "./types/domain.js";

export interface TimerSpec {
  name: string;
  durationMs: number;
  playerId?: string;
}

export interface StandingsRow {
  playerId: string;
  displayName: string;
  avatarId: string;
  stack: number;
  totalBuyIn: number;
  net: number;
  roundsOrHandsPlayed: number;
}

export interface GameModule<Config = any, State = any, Action = any, Event = any, View = any> {
  id: GameType;
  configSchema: z.ZodType<Config, any, any>;
  defaultConfig: Config;
  createState(roomCode: string, config: Config): State;
  reduce(state: State, action: Action): { state: State; events: Event[] };
  legalActions(state: State, playerId: string): string[];
  viewFor(state: State, viewerId: string): View;
  timerSpec(state: State): TimerSpec[];
  onTimeout(state: State, playerId: string): Action | null;
  onDisconnect(state: State, playerId: string): Action | null;
  standings(state: State, participants: Map<string, Participant>): StandingsRow[];
  invariants(state: State): string[];
  scanForLeaks?(view: View, state?: State): string[];
}
