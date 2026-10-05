import type { SeatNumber } from "@felt/shared";
import type React from "react";
import { soundEngine } from "../audio/sound-engine";
import { ActionBar } from "../components/ActionBar";
import { Choreographer } from "../components/Choreographer";
import { DealerArea } from "../components/DealerArea";
import { HeaderBar } from "../components/HeaderBar";
import { SeatView } from "../components/SeatView";
import { ChatDrawer } from "../components/modals/ChatDrawer";
import { HostPanelModal } from "../components/modals/HostPanelModal";
import { RebuyModal } from "../components/modals/RebuyModal";
import { SettingsModal } from "../components/modals/SettingsModal";
import { StandingsModal } from "../components/modals/StandingsModal";
import { useTableChoreography } from "../hooks/useTableChoreography";
import { useGameStore } from "../store/game-store";

export const TableScreen: React.FC = () => {
  // Reactive table state subscriptions
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const selectedChip = useGameStore((s) => s.selectedChip);

  // Static action methods (stable references from Zustand store)
  const {
    setSelectedChip,
    openModal,
    sit,
    betAdd,
    betUndo,
    betClear,
    betRepeat,
    betLock,
    betSitOut,
    playHit,
    playStand,
    playDouble,
    playSplit,
    playInsurance,
    dealerDeal,
    dealerReveal,
    dealerDraw,
    dealerNextRound,
    dealerShuffle,
  } = useGameStore.getState();

  const choreography = useTableChoreography(currentView);

  if (!currentView) return null;

  const {
    participants,
    hands,
    stacks,
    activeHandId,
    config,
    dealerHand,
    dealerBank,
    phase,
    dealerId,
    hostId,
  } = currentView;

  const myParticipant = participants.find((p) => p.id === myPlayerId);
  const mySeat = myParticipant?.seat ?? null;
  const isSpectator = mySeat === null;
  const isDealerOrHost = myPlayerId === dealerId || myPlayerId === hostId;

  const allSeats: SeatNumber[] = [1, 2, 3, 4, 5, 6, 7];

  // If player is seated, other seats are in the arc
  const otherSeats = isSpectator ? allSeats : allSeats.filter((s) => s !== mySeat);

  // Check if player has low stack and can rebuy
  const myStack = myPlayerId ? (stacks[myPlayerId] ?? 0) : 0;
  const canRebuy = !isSpectator && myStack < config.minBet;

  return (
    <div
      onClickCapture={() => soundEngine.unlock()}
      className="relative flex flex-col h-screen w-full bg-[#051108] text-emerald-100 overflow-hidden select-none"
    >
      {/* Top Header */}
      <HeaderBar />

      {/* Main Felt Canvas */}
      <main className="flex-1 relative flex flex-col overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        {/* Felt Table Surface Background & Horseshoe Border */}
        <div className="relative flex-1 w-full max-w-5xl mx-auto rounded-[3rem] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#195a32] via-[#0f3d20] to-[#07190c] border-[6px] border-[#0c2214] shadow-[inset_0_0_80px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.6)] flex flex-col justify-between p-3 sm:p-6 pb-2">
          {/* Subtle Casino Table Markings */}
          <div className="absolute inset-x-0 top-1/3 flex flex-col items-center justify-center pointer-events-none opacity-25 text-center">
            <span className="text-xs sm:text-sm font-black tracking-[0.25em] text-gold-300 uppercase">
              Blackjack Pays {config.blackjackPayout}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold tracking-widest text-emerald-300 uppercase mt-0.5">
              Dealer must stand on 17 and draw to 16
            </span>
            <span className="text-[9px] font-mono tracking-wider text-emerald-400/80 uppercase mt-0.5">
              Insurance Pays 2 to 1
            </span>
          </div>

          {/* Upper Section: Dealer Area */}
          <div className="relative z-10 w-full flex justify-center pt-1 pb-3">
            <DealerArea
              dealerHand={dealerHand}
              dealerParticipant={participants.find((p) => p.id === dealerId)}
              dealerBank={dealerBank ?? 0}
              phase={phase}
              isDealerOrHost={isDealerOrHost}
              canDeal={
                phase === "betting" && Object.keys(currentView.lockedBets ?? {}).length > 0
              }
              dealerDrawMode={config.dealerDrawMode}
              onDeal={dealerDeal}
              onReveal={dealerReveal}
              onDraw={dealerDraw}
              onNextRound={dealerNextRound}
              onShuffle={dealerShuffle}
              displayedCards={choreography.displayedDealerCards}
              statusMessage={choreography.statusMessage}
              isFlippingHole={choreography.isFlippingHole}
            />
          </div>

          {/* Rebuy Alert Banner if Stack Low */}
          {canRebuy && (
            <div className="relative z-20 mx-auto mb-2 flex items-center gap-2 bg-amber-950/80 border border-amber-500/70 px-4 py-2 rounded-xl text-xs text-amber-200 shadow-lg animate-pulse">
              <span>Your stack is below the minimum bet!</span>
              <button
                type="button"
                onClick={() => openModal("rebuy")}
                className="px-2.5 py-1 rounded-lg bg-gold-400 hover:bg-gold-300 text-black font-bold text-[11px] shadow transition-transform active:scale-95"
              >
                Request Rebuy
              </button>
            </div>
          )}

          {/* Middle/Lower Section: Player Seats */}
          <div className="relative z-10 w-full flex flex-col justify-end gap-3 my-auto">
            {/* Other Seats (Arc / Carousel for other players) */}
            <div className="w-full flex items-center justify-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none">
              {otherSeats.map((seatNum) => {
                const occupant = participants.find((p) => p.seat === seatNum);
                const seatHands = hands.filter((h) => h.seatNumber === seatNum);
                const occupantStack = occupant ? (stacks[occupant.id] ?? 0) : 0;

                return (
                  <SeatView
                    key={`seat-${seatNum}`}
                    seatNumber={seatNum}
                    participant={occupant}
                    hands={seatHands}
                    stack={occupantStack}
                    activeHandId={activeHandId}
                    isMySeat={false}
                    canSit={isSpectator}
                    onSit={sit}
                    pendingBet={occupant ? (currentView.pendingBets?.[occupant.id] ?? 0) : 0}
                    lockedBet={occupant ? (currentView.lockedBets?.[occupant.id] ?? 0) : 0}
                    showOutcomes={choreography.showOutcomes}
                    dealtCardsPerHand={choreography.dealtCardsPerHand}
                  />
                );
              })}
            </div>

            {/* If player is seated, highlight their seat front and center at the bottom */}
            {mySeat !== null && (
              <div className="w-full flex justify-center pt-1">
                <div className="scale-105 sm:scale-110">
                  <SeatView
                    seatNumber={mySeat}
                    participant={myParticipant}
                    hands={hands.filter((h) => h.seatNumber === mySeat)}
                    stack={myStack}
                    activeHandId={activeHandId}
                    isMySeat={true}
                    pendingBet={myPlayerId ? (currentView.pendingBets?.[myPlayerId] ?? 0) : 0}
                    lockedBet={myPlayerId ? (currentView.lockedBets?.[myPlayerId] ?? 0) : 0}
                    showOutcomes={choreography.showOutcomes}
                    dealtCardsPerHand={choreography.dealtCardsPerHand}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Pinned Bottom Thumb Reach Action Bar */}
      <ActionBar
        view={currentView}
        myPlayerId={myPlayerId}
        selectedChip={selectedChip}
        onSelectChip={setSelectedChip}
        onBetAdd={betAdd}
        onBetUndo={betUndo}
        onBetClear={betClear}
        onBetRepeat={betRepeat}
        onBetLock={betLock}
        onBetSitOut={betSitOut}
        onHit={playHit}
        onStand={playStand}
        onDouble={playDouble}
        onSplit={playSplit}
        onInsurance={playInsurance}
      />

      {/* Slide-overs & Modals */}
      <Choreographer showOutcomes={choreography.showOutcomes} />
      <ChatDrawer />
      <HostPanelModal />
      <StandingsModal />
      <RebuyModal />
      <SettingsModal />
    </div>
  );
};
