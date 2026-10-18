import type { ActivityEntry, GameEvent, GameState, Hand, Participant } from "@felt/shared";
import { evaluateHand } from "@felt/shared";

export function formatEventActivity(
  event: any,
  state: any,
  participants: Map<string, Participant>,
): string | null {
  const getName = (id: string): string => {
    if (!id) return "Unknown";
    if (id === "dealer") return "Dealer";
    const p = participants.get(id);
    return p ? p.displayName : id;
  };

  switch (event.type) {
    // ─── Blackjack Events ──────────────────────────────────────────────────
    case "chipsBet": {
      return `${getName(event.playerId)} bet ${event.amount?.toLocaleString() ?? 0}`;
    }

    case "cardFlipped": {
      if (state.dealerHand?.cards) {
        const hv = evaluateHand(state.dealerHand.cards);
        return `Dealer reveals ${hv.total}${hv.isSoft ? " (soft)" : ""}`;
      }
      return "Dealer revealed hole card";
    }

    case "handResult": {
      if (!Array.isArray(state.hands)) return null;
      const hand = state.hands.find((h: Hand) => h.id === event.handId);
      const name = hand ? getName(hand.playerId) : "Player";
      const total = hand ? evaluateHand(hand.cards).total : 0;

      if (event.result === "blackjack") {
        return `${name} wins ${Math.abs(event.net ?? 0).toLocaleString()} (Blackjack!)`;
      }
      if (event.result === "bust") {
        return `${name} busted with ${total}`;
      }
      if (event.result === "win") {
        return `${name} wins ${Math.abs(event.net ?? 0).toLocaleString()}`;
      }
      if (event.result === "loss") {
        return `${name} loses ${Math.abs(event.net ?? 0).toLocaleString()}`;
      }
      if (event.result === "push") {
        return `${name} pushes with ${total}`;
      }
      return null;
    }

    case "insuranceOffered": {
      return "Insurance offered";
    }

    case "insuranceResolved": {
      return event.dealerHasBlackjack
        ? "Dealer has Blackjack! Insurance pays 2:1"
        : "Dealer does not have Blackjack";
    }

    // ─── Poker Events ──────────────────────────────────────────────────────
    case "handStarted": {
      return `Hand #${event.handNumber} started`;
    }

    case "blindsPosted": {
      const sbName = getName(event.sbPlayerId);
      const bbName = getName(event.bbPlayerId);
      return `${sbName} posts SB ₹${event.sbAmount}, ${bbName} posts BB ₹${event.bbAmount}`;
    }

    case "boardCardDealt": {
      const card = event.card;
      const cardStr = card ? `${card.rank}${card.suit}` : "Card";
      const streetName = event.street ? event.street.toUpperCase() : "BOARD";
      return `[${streetName}] dealt: ${cardStr}`;
    }

    case "actionTaken": {
      const name = getName(event.playerId);
      const amt = event.amount ? `₹${event.amount.toLocaleString()}` : "";
      switch (event.action) {
        case "fold":
          return `${name} folded`;
        case "check":
          return `${name} checked`;
        case "call":
          return `${name} called ${amt}`;
        case "bet":
          return `${name} bet ${amt}`;
        case "raise":
          return `${name} raised to ${amt}`;
        case "all-in":
          return `${name} went All-in (${amt || `₹${event.stackAfter?.toLocaleString() ?? 0}`})`;
        default:
          return `${name} acted (${event.action})`;
      }
    }

    case "potAwarded": {
      const winners = Array.isArray(event.winners)
        ? event.winners.map((id: string) => getName(id)).join(", ")
        : "Player";
      const handInfo = event.handName ? ` with ${event.handName}` : "";
      return `🏆 ${winners} won ₹${event.amount?.toLocaleString() ?? 0}${handInfo}`;
    }

    case "uncalledBetReturned": {
      return `₹${event.amount?.toLocaleString() ?? 0} uncalled bet returned to ${getName(event.playerId)}`;
    }

    case "playerSeenCards": {
      return `👁️ ${getName(event.playerId)} saw their cards (Playing Seen)`;
    }

    // ─── Common / Host Events ──────────────────────────────────────────────
    case "chipsAdjusted": {
      const targetName = event.target === "dealer" ? "the dealer bank" : getName(event.target);
      const opVerb = event.op === "add" ? "added" : event.op === "subtract" ? "deducted" : "set";
      return `Host ${opVerb} ${event.amount?.toLocaleString() ?? 0} chips for ${targetName}`;
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
