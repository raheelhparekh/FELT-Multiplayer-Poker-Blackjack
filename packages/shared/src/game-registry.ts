import { BlackjackModule } from "./blackjack-module.js";
import type { GameModule } from "./game-module.js";
import { PokerModule } from "./poker/poker-module.js";
import type { GameType } from "./types/domain.js";

const modules = new Map<GameType, GameModule>();
modules.set("blackjack", BlackjackModule);
modules.set("poker", PokerModule);

export function registerGameModule(module: GameModule): void {
  modules.set(module.id, module);
}

export function getGameModule(gameType: GameType): GameModule {
  const mod = modules.get(gameType);
  if (!mod) {
    throw new Error(`Unknown game type: "${gameType}". Registered games: ${[...modules.keys()].join(", ")}`);
  }
  return mod;
}

export function isGameRegistered(gameType: string): gameType is GameType {
  return modules.has(gameType as GameType);
}

export function getRegisteredGameTypes(): GameType[] {
  return [...modules.keys()];
}
