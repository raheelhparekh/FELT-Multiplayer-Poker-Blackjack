import type { ClientCard, ClientHand, GamePhase, Participant } from "@felt/shared";
import { evaluateHand } from "@felt/shared";
import type React from "react";
import { getAvatarEmoji } from "../types/avatars";
import { CardView } from "./CardView";

interface DealerAreaProps {
  dealerHand: ClientHand | null;
  dealerParticipant?: Participant | undefined;
  dealerBank: number;
  phase: GamePhase;
  isDealerOrHost: boolean;
  canDeal: boolean;
  dealerDrawMode: "auto" | "manual";
  onDeal: () => void;
  onReveal: () => void;
  onDraw: () => void;
  onNextRound: () => void;
  onShuffle: () => void;
  displayedCards?: ClientCard[] | undefined;
  statusMessage?: string | null | undefined;
  isFlippingHole?: boolean | undefined;
}

export const DealerArea: React.FC<DealerAreaProps> = ({
  dealerHand,
  dealerParticipant,
  dealerBank,
  phase,
  isDealerOrHost,
  canDeal,
  dealerDrawMode,
  onDeal,
  onReveal,
  onDraw,
  onNextRound,
  onShuffle,
  displayedCards,
  statusMessage,
  isFlippingHole = false,
}) => {
  const emoji = dealerParticipant ? getAvatarEmoji(dealerParticipant.avatarId) : "🏦";
  const name = dealerParticipant ? dealerParticipant.displayName : "Dealer";

  // Use suspense displayed cards if provided, otherwise fallback to dealerHand.cards
  const activeCards = displayedCards && displayedCards.length > 0
    ? displayedCards
    : (dealerHand?.cards ?? []);

  // Calculate visible total directly from active cards displayed on table
  const visibleCards = activeCards.flatMap((c: ClientCard) => ("card" in c ? [c.card] : []));
  const evalResult = visibleCards.length > 0 ? evaluateHand(visibleCards) : null;
  const hasHiddenCard = activeCards.some((c: ClientCard) => "hidden" in c && c.hidden);
  const isRevealed = !hasHiddenCard && activeCards.length >= 2;

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-900/70 border border-gold-500/20 backdrop-blur-sm max-w-sm sm:max-w-md w-full mx-auto shadow-xl">
      {/* Dealer Title & Bank */}
      <div className="flex items-center justify-between w-full px-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xl select-none">{emoji}</span>
          <span className="text-sm font-bold text-white">{name}</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-gold-300 text-[10px] font-bold border border-gold-500/30">
            DEALER
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-felt-light/60 block">Bank</span>
          <span className="text-sm font-bold text-gold-300 font-mono">
            ₹{dealerBank.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Dealer Cards */}
      <div className="flex flex-col items-center justify-center min-h-[95px] w-full my-1">
        {activeCards.length > 0 ? (
          <>
            <div className="flex items-center justify-center -space-x-5">
              {activeCards.map((slot: ClientCard, idx: number) => {
                const key =
                  "card" in slot ? `${slot.card.suit}-${slot.card.rank}-${idx}` : `hidden-${idx}`;
                const isFlipping = isFlippingHole && idx === 1;
                return (
                  <CardView
                    key={key}
                    cardSlot={slot}
                    dealIndex={idx}
                    isFlipping={isFlipping}
                  />
                );
              })}
            </div>

            {/* Total / Badges */}
            <div className="mt-2 flex flex-col items-center gap-1">
              {evalResult && (
                <div
                  className={`px-3 py-0.5 rounded-full text-xs font-black shadow transition-all ${
                    isRevealed && evalResult.isBust
                      ? "bg-rose-900/90 border border-rose-500 text-rose-200 animate-bust-shake shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                      : isRevealed && evalResult.isBlackjack
                        ? "bg-gold-400 text-black border border-gold-300 shadow-[0_0_15px_rgba(240,208,96,0.6)]"
                        : "bg-neutral-950/90 border border-gold-400/40 text-gold-300"
                  }`}
                >
                  {isRevealed
                    ? evalResult.isBlackjack
                      ? "BLACKJACK!"
                      : evalResult.isBust
                        ? `BUST (${evalResult.total})`
                        : evalResult.isSoft && evalResult.total <= 21
                          ? `${evalResult.total} (Soft)`
                          : `${evalResult.total}`
                    : `Showing: ${evalResult.total}`}
                </div>
              )}

              {/* Suspense Live Status Banner */}
              {statusMessage && (
                <div className="px-3 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/60 text-[11px] font-black text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-ping" />
                  <span>{statusMessage}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-20 text-xs text-felt-light/40 italic">
            Waiting for deal...
          </div>
        )}
      </div>

      {/* Dealer Control Actions (Deal, Reveal, Draw, Next Round, Shuffle) */}
      {isDealerOrHost && (
        <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-white/10 w-full flex-wrap">
          {phase === "betting" && (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!canDeal}
                onClick={onDeal}
                className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-bold text-white shadow-md disabled:opacity-40 transition-transform active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              >
                Deal Cards
              </button>
              {!canDeal && (
                <span className="text-[10px] text-amber-300/80 font-medium">
                  Waiting for at least 1 player to lock a bet
                </span>
              )}
            </div>
          )}

          {phase === "dealer_turn" && dealerDrawMode === "manual" && (
            <>
              <button
                type="button"
                onClick={onReveal}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white shadow-md transition-transform active:scale-95"
              >
                Reveal Hole Card
              </button>
              <button
                type="button"
                onClick={onDraw}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md transition-transform active:scale-95"
              >
                Draw Card
              </button>
            </>
          )}

          {phase === "round_summary" && (
            <button
              type="button"
              onClick={onNextRound}
              className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-bold text-white shadow-md transition-transform active:scale-95"
            >
              Next Round →
            </button>
          )}

          {(phase === "lobby" || phase === "round_summary") && (
            <button
              type="button"
              onClick={onShuffle}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 border border-neutral-700"
            >
              Shuffle Shoe
            </button>
          )}
        </div>
      )}
    </div>
  );
};
