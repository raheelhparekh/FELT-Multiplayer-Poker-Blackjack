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
      className="relative flex flex-col h-[100dvh] w-full bg-[var(--felt-bg)] text-[var(--felt-text)] overflow-hidden select-none transition-colors duration-500"
    >
      {/* Top Header */}
      <HeaderBar />

      {/* Main Felt Canvas */}
      <main className="flex-1 relative flex flex-col overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        {/* Felt Table Surface Background & Horseshoe Border */}
        <div
          className="relative flex-1 w-full max-w-5xl mx-auto rounded-[2.5rem] sm:rounded-[3rem] border-[6px] shadow-[inset_0_0_90px_rgba(0,0,0,0.85),0_10px_35px_rgba(0,0,0,0.7)] flex flex-col justify-between p-2.5 sm:p-6 pb-2 transition-all duration-500"
          style={{
            background:
              "radial-gradient(ellipse at top, var(--felt-surface-from) 0%, var(--felt-surface-via) 55%, var(--felt-surface-to) 100%)",
            borderColor: "var(--felt-rail)",
          }}
        >
          {/* Subtle Casino Table Markings */}
          <div className="absolute inset-x-0 top-1/3 flex flex-col items-center justify-center pointer-events-none opacity-30 text-center">
            <span
              className="text-xs sm:text-sm font-black tracking-[0.25em] uppercase"
              style={{ color: "var(--felt-accent)" }}
            >
              Blackjack Pays {config.blackjackPayout}
            </span>
            <span
              className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase mt-0.5"
              style={{ color: "var(--felt-text)" }}
            >
              Dealer must stand on 17 and draw to 16
            </span>
            <span
              className="text-[9px] font-mono tracking-wider uppercase mt-0.5 opacity-80"
              style={{ color: "var(--felt-text)" }}
            >
              Insurance Pays 2 to 1 • Table #{currentView.roomCode}
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
              canDeal={phase === "betting" && Object.keys(currentView.lockedBets ?? {}).length > 0}
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

          {/* Table Paused / Waiting for Reconnect Banner */}
          {(currentView.isPaused || currentView.waitingForReconnect) && (
            <div className="relative z-20 mx-auto mb-2 flex flex-wrap items-center justify-center gap-2 bg-amber-950/90 border border-amber-500/80 px-4 py-2 rounded-2xl text-xs text-amber-100 shadow-xl backdrop-blur max-w-lg text-center animate-fade-in">
              <span className="text-base shrink-0">⏸</span>
              <div className="flex-1 min-w-[200px]">
                <span className="font-bold block text-amber-300">
                  {currentView.waitingForReconnect ||
                    currentView.tableStatusMessage ||
                    "Game Paused"}
                </span>
                {currentView.isPaused && (
                  <span className="text-[10px] text-amber-200/80 block">
                    All action and turn timers are frozen.
                  </span>
                )}
              </div>
              {myPlayerId === hostId && currentView.isPaused && (
                <button
                  type="button"
                  onClick={() => useGameStore.getState().resume()}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-transform active:scale-95 shrink-0"
                >
                  ▶ Resume
                </button>
              )}
            </div>
          )}

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
                const hasPendingChipAdjustment = occupant
                  ? (currentView.pendingChipAdjustmentPlayers?.includes(occupant.id) ?? false)
                  : false;

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
                    hasPendingChipAdjustment={hasPendingChipAdjustment}
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
                    hasPendingChipAdjustment={
                      myPlayerId
                        ? (currentView.pendingChipAdjustmentPlayers?.includes(myPlayerId) ?? false)
                        : false
                    }
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
