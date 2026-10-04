import type { ActivityEntry, GameEvent, GameState, Hand, Participant } from "@felt/shared";
import { evaluateHand } from "@felt/shared";

export function formatEventActivity(
  event: GameEvent,
  state: GameState,
  participants: Map<string, Participant>,
): string | null {
  const getName = (id: string): string => {
    if (id === "dealer") return "Dealer";
    const p = participants.get(id);
    return p ? p.displayName : id;
  };

  switch (event.type) {
    case "chipsBet": {
      return `${getName(event.playerId)} bet ${event.amount.toLocaleString()}`;
    }

    case "cardFlipped": {
      if (state.dealerHand) {
        const hv = evaluateHand(state.dealerHand.cards);
        return `Dealer reveals ${hv.total}${hv.isSoft ? " (soft)" : ""}`;
      }
      return "Dealer revealed hole card";
    }

    case "handResult": {
      const hand = state.hands.find((h: Hand) => h.id === event.handId);
      const name = hand ? getName(hand.playerId) : "Player";
      const total = hand ? evaluateHand(hand.cards).total : 0;

      if (event.result === "blackjack") {
        return `${name} wins ${Math.abs(event.net).toLocaleString()} (Blackjack!)`;
      }
      if (event.result === "bust") {
        return `${name} busted with ${total}`;
      }
      if (event.result === "win") {
        return `${name} wins ${Math.abs(event.net).toLocaleString()}`;
      }
      if (event.result === "loss") {
        return `${name} loses ${Math.abs(event.net).toLocaleString()}`;
      }
      if (event.result === "push") {
        return `${name} pushes with ${total}`;
      }
      return null;
    }

    case "chipsAdjusted": {
      const targetName = event.target === "dealer" ? "the dealer bank" : getName(event.target);
      const opVerb = event.op === "add" ? "added" : event.op === "subtract" ? "deducted" : "set";
      return `Host ${opVerb} ${event.amount.toLocaleString()} chips for ${targetName}`;
    }

    case "roundStarted": {
      return `Round ${event.roundNumber} started`;
    }

    case "sessionStarted": {
      return "Session started";
    }

    case "shuffled": {
      return "Dealer shuffled the shoe";
    }

    case "insuranceOffered": {
      return "Insurance offered";
    }

    case "insuranceResolved": {
      return event.dealerHasBlackjack
        ? "Dealer has Blackjack! Insurance pays 2:1"
        : "Dealer does not have Blackjack";
    }

    default:
      return null;
  }
}

export function createActivityEntry(seq: number, text: string): ActivityEntry {
  return {
    seq,
    ts: Date.now(),
    text,
  };
}
