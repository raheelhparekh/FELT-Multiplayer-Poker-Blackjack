import type { ClientCard, ClientHand, Participant } from "@felt/shared";
import { evaluateHand } from "@felt/shared";
import type React from "react";
import { getAvatarEmoji } from "../types/avatars";
import { CardView } from "./CardView";
import { ChipStack } from "./ChipView";

interface SeatViewProps {
  seatNumber: number;
  participant?: Participant | undefined;
  hands: ClientHand[];
  stack?: number | undefined;
  activeHandId?: string | null | undefined;
  isMySeat?: boolean;
  onSit?: (seat: number) => void;
  canSit?: boolean;
  pendingBet?: number | undefined;
  lockedBet?: number | undefined;
  showOutcomes?: boolean | undefined;
  dealtCardsPerHand?: Record<string, number> | undefined;
}

export const SeatView: React.FC<SeatViewProps> = ({
  seatNumber,
  participant,
  hands,
  stack = 0,
  activeHandId,
  isMySeat = false,
  onSit,
  canSit = false,
  pendingBet = 0,
  lockedBet = 0,
  showOutcomes = true,
  dealtCardsPerHand,
}) => {
  if (!participant) {
    // Empty seat
    return (
      <div className="flex flex-col items-center justify-center p-2 rounded-2xl border-2 border-dashed border-emerald-800/30 bg-black/20 min-w-[105px] min-h-[135px] text-center backdrop-blur-xs transition-colors hover:border-emerald-600/50">
        <span className="text-[10px] text-emerald-500/60 font-semibold mb-1">
          Seat {seatNumber}
        </span>
        {canSit && onSit ? (
          <button
            type="button"
            onClick={() => onSit(seatNumber)}
            className="px-3 py-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 active:scale-95 text-xs font-bold text-emerald-100 border border-emerald-600/50 shadow transition-all"
          >
            Sit Here
          </button>
        ) : (
          <span className="text-xs text-emerald-600/40 italic">Open</span>
        )}
      </div>
    );
  }

  const emoji = getAvatarEmoji(participant.avatarId);
  const isConnected = participant.isConnected;
  const isAnyHandActive = hands.some((h: ClientHand) => h.id === activeHandId);

  return (
    <div
      className={`relative flex flex-col items-center p-2 rounded-2xl border transition-all min-w-[125px] max-w-[165px] ${
        isMySeat
          ? "border-gold-400/90 bg-black/75 shadow-2xl ring-2 ring-gold-400/30"
          : "border-emerald-800/50 bg-black/60 shadow-lg"
      } ${isAnyHandActive ? "animate-turn-pulse ring-2 ring-gold-400" : ""}`}
    >
      {/* Participant Header */}
      <div className="flex items-center gap-1.5 w-full justify-between mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-base select-none">{emoji}</span>
          <span className="text-xs font-bold text-white truncate max-w-[70px]">
            {participant.displayName}
          </span>
          {participant.isHost && (
            <span className="text-xs select-none" title="Host">
              👑
            </span>
          )}
        </div>
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isConnected ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-neutral-500"
          }`}
          title={isConnected ? "Connected" : "Disconnected"}
        />
      </div>

      {/* Stack & Seat Label */}
      <div className="flex items-center justify-between w-full text-[11px] mb-1.5 px-0.5 font-mono">
        <span className="text-emerald-500/70 font-semibold">S{seatNumber}</span>
        <span className="font-bold text-gold-300">₹{stack.toLocaleString()}</span>
      </div>

      {/* Hands Area */}
      <div className="flex flex-col gap-2 items-center w-full">
        {hands.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[64px] py-1">
            {lockedBet > 0 ? (
              <div className="flex flex-col items-center gap-1">
                <ChipStack totalBet={lockedBet} isSmall={!isMySeat} />
                <span className="text-[10px] font-bold font-mono text-gold-300 bg-black/60 px-1.5 py-0.5 rounded border border-gold-400/30">
                  ✓ ₹{lockedBet.toLocaleString()}
                </span>
              </div>
            ) : pendingBet > 0 ? (
              <div className="flex flex-col items-center gap-1">
                <ChipStack totalBet={pendingBet} isSmall={!isMySeat} />
                <span className="text-[10px] font-semibold font-mono text-emerald-300 bg-black/60 px-1.5 py-0.5 rounded border border-emerald-500/30 animate-pulse">
                  ₹{pendingBet.toLocaleString()}
                </span>
              </div>
            ) : (
              <div className="w-12 h-16 rounded-xl border border-dashed border-emerald-900/40 flex items-center justify-center text-[10px] text-emerald-600/50 font-medium">
                Waiting
              </div>
            )}
          </div>
        ) : (
          hands.map((hand: ClientHand) => {
            const isActive = hand.id === activeHandId;
            // Only limit cards during initial deal animation when hand has 2 cards and deal animation is in progress
            const isInitialDealing =
              dealtCardsPerHand !== undefined &&
              hand.id in dealtCardsPerHand &&
              (dealtCardsPerHand[hand.id] ?? 0) < 2 &&
              hand.cards.length <= 2;
            const currentHandCards = isInitialDealing
              ? hand.cards.slice(0, dealtCardsPerHand[hand.id])
              : hand.cards;
            const visibleCards = currentHandCards.flatMap((c: ClientCard) => ("card" in c ? [c.card] : []));
            const evalResult = visibleCards.length > 0 ? evaluateHand(visibleCards) : null;
            const totalBet = hand.bet + hand.doubleBet;

            let badgeText = "";
            let badgeColor = "bg-neutral-800 text-neutral-300";
            let specialFxClass = "";

            // If suspense is running (showOutcomes is false), only show BUST if player busted on their own turn.
            // Do not reveal WIN, LOST, or PUSH until the dealer has finished revealing and drawing!
            if (showOutcomes) {
              if (hand.result === "blackjack") {
                badgeText = "BLACKJACK!";
                badgeColor = "bg-gold-400 text-black font-black border border-gold-300";
                specialFxClass = "animate-gold-shimmer";
              } else if (hand.result === "bust") {
                badgeText = "BUST";
                badgeColor = "bg-rose-600 text-white font-bold border border-rose-500";
                specialFxClass = "animate-bust-shake";
              } else if (hand.result === "win") {
                badgeText = "WIN";
                badgeColor = "bg-emerald-600 text-white font-bold border border-emerald-400";
              } else if (hand.result === "loss") {
                badgeText = "LOST";
                badgeColor = "bg-neutral-800 text-neutral-400";
              } else if (hand.result === "push") {
                badgeText = "PUSH";
                badgeColor = "bg-blue-600 text-white font-bold border border-blue-400";
              }
            } else if (evalResult?.isBust) {
              badgeText = "BUST";
              badgeColor = "bg-rose-600 text-white font-bold border border-rose-500";
              specialFxClass = "animate-bust-shake";
            }

            return (
              <div
                key={hand.id}
                className={`relative flex flex-col items-center p-1.5 rounded-xl w-full transition-all ${
                  isActive
                    ? "bg-amber-500/15 ring-2 ring-gold-400 shadow-[0_0_15px_rgba(212,175,55,0.5)]"
                    : "bg-black/30"
                } ${specialFxClass}`}
              >
                {/* 3D Chip Stack on Bet Spot */}
                {totalBet > 0 && (
                  <div className="mb-1">
                    <ChipStack totalBet={totalBet} isSmall={!isMySeat} />
                  </div>
                )}

                {/* Overlapping Cards Fan */}
                <div className="flex items-center justify-center -space-x-4 my-1 min-h-[48px]">
                  {currentHandCards.map((c: ClientCard, idx: number) => {
                    const cardKey =
                      "card" in c ? `${c.card.suit}-${c.card.rank}-${idx}` : `card-${idx}`;
                    // If doubled down, rotate the last card 90 degrees
                    const isDoubledCard = hand.isDoubled && idx === currentHandCards.length - 1;

                    return (
                      <CardView
                        key={cardKey}
                        cardSlot={c}
                        isSmall={!isMySeat}
                        isRotated90={isDoubledCard}
                        dealIndex={idx}
                        className="transition-transform hover:translate-y-[-2px]"
                      />
                    );
                  })}
                </div>

                {/* Total / Result Indicator */}
                <div className="flex items-center justify-center mt-1">
                  {badgeText ? (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider shadow ${badgeColor}`}
                    >
                      {badgeText}
                    </span>
                  ) : evalResult ? (
                    <span className="px-2 py-0.5 rounded-md bg-neutral-900/90 border border-emerald-500/30 text-[10px] font-bold text-white shadow">
                      {evalResult.isSoft && !evalResult.isBlackjack && evalResult.total <= 21
                        ? `${evalResult.total - 10}/${evalResult.total}`
                        : evalResult.total}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
