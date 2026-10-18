import React, { useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientPokerGameView, SeatNumber } from "@felt/shared";
import { soundEngine } from "../audio/sound-engine";
import { HeaderBar } from "../components/HeaderBar";
import { PokerCommunityArea } from "../components/poker/PokerCommunityArea";
import { PokerSeatView } from "../components/poker/PokerSeatView";
import { PokerActionBar } from "../components/poker/PokerActionBar";
import { ChatDrawer } from "../components/modals/ChatDrawer";
import { HostPanelModal } from "../components/modals/HostPanelModal";
import { RebuyModal } from "../components/modals/RebuyModal";
import { SettingsModal } from "../components/modals/SettingsModal";
import { StandingsModal } from "../components/modals/StandingsModal";
import { useGameStore } from "../store/game-store";

// Visual slot positions (in percentage of table width/height) around a 9-max oval table.
// Slot 0 is bottom center (anchored to hero).
const SEAT_POSITIONS_9: Array<{ left: string; top: string }> = [
  { left: "50%", top: "86%" }, // 0: Bottom Center (Hero)
  { left: "20%", top: "80%" }, // 1: Bottom Left
  { left: "9%", top: "50%" },  // 2: Middle Left
  { left: "20%", top: "20%" }, // 3: Top Left
  { left: "37%", top: "12%" }, // 4: Top Center-Left
  { left: "63%", top: "12%" }, // 5: Top Center-Right
  { left: "80%", top: "20%" }, // 6: Top Right
  { left: "91%", top: "50%" }, // 7: Middle Right
  { left: "80%", top: "80%" }, // 8: Bottom Right
];

export const PokerTableScreen: React.FC = () => {
  const currentView = useGameStore((s) => s.currentView) as ClientPokerGameView | null;
  const myPlayerId = useGameStore((s) => s.myPlayerId);

  const {
    sit,
    openModal,
    pokerFold,
    pokerCheck,
    pokerCall,
    pokerBet,
    pokerRaise,
    pokerAllIn,
    pokerNextHand,
    resume,
  } = useGameStore.getState();

  if (!currentView || currentView.gameType !== "poker") return null;

  const myPlayer = currentView.players.find((p) => p.id === myPlayerId) ?? null;
  const mySeat = myPlayer?.seatNumber ?? null;
  const isSpectator = mySeat === null;
  const isHost = currentView.hostId === myPlayerId;
  const maxSeats = ((currentView.config as any).maxSeats ?? 9) as number;

  // Generate seats 1..maxSeats
  const allSeatNumbers: SeatNumber[] = useMemo(() => {
    return Array.from({ length: maxSeats }, (_, i) => (i + 1) as SeatNumber);
  }, [maxSeats]);

  // Rotate seat numbers so that hero's seat is at slot 0 (bottom-center)
  const orderedSeats: SeatNumber[] = useMemo(() => {
    if (mySeat === null) {
      return allSeatNumbers;
    }
    const heroIndex = allSeatNumbers.indexOf(mySeat);
    if (heroIndex === -1) return allSeatNumbers;
    return [
      ...allSeatNumbers.slice(heroIndex),
      ...allSeatNumbers.slice(0, heroIndex),
    ];
  }, [allSeatNumbers, mySeat]);

  // Compute hero turn & bet requirements
  const isMyTurn = myPlayer?.isTurn ?? false;
  const heroCommittedThisRound = myPlayer?.committedThisRound ?? 0;
  const toCall = Math.max(0, currentView.currentBet - heroCommittedThisRound);
  const minRaise = currentView.currentBet > 0
    ? currentView.currentBet * 2
    : currentView.config.bigBlind * 2;

  const totalPot = currentView.pots.reduce((sum, p) => sum + p.amount, 0);

  // Audio deal cues when hand starts or community street advances
  const prevHandRef = useRef(currentView.handNumber);
  const prevStreetRef = useRef(currentView.street);

  useEffect(() => {
    // New hand dealt: play sequential casino card deals around table
    if (currentView.handNumber > prevHandRef.current && currentView.players.length > 0) {
      prevHandRef.current = currentView.handNumber;
      const seatedCount = currentView.players.filter((p) => !p.hasFolded).length || 2;
      // 2 cards dealt to each player clockwise
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < seatedCount; i++) {
          const timeout = (r * seatedCount + i) * 130;
          setTimeout(() => {
            soundEngine.play("card_deal");
          }, timeout);
        }
      }
    } else {
      prevHandRef.current = currentView.handNumber;
    }
  }, [currentView.handNumber, currentView.players]);

  useEffect(() => {
    // Street advanced (Flop, Turn, River): play sequential card deal sounds
    if (currentView.street && currentView.street !== prevStreetRef.current) {
      prevStreetRef.current = currentView.street;
      if (currentView.street === "flop") {
        setTimeout(() => soundEngine.play("card_deal"), 80);
        setTimeout(() => soundEngine.play("card_deal"), 300);
        setTimeout(() => soundEngine.play("card_deal"), 520);
      } else if (currentView.street === "turn" || currentView.street === "river") {
        setTimeout(() => soundEngine.play("card_deal"), 100);
      }
    } else {
      prevStreetRef.current = currentView.street;
    }
  }, [currentView.street]);

  // Check if seated player has low stack
  const canRebuy = !isSpectator && myPlayer && myPlayer.stack < currentView.config.bigBlind;

  return (
    <div
      onClickCapture={() => soundEngine.unlock()}
      className="relative flex flex-col h-[100dvh] w-full bg-[var(--felt-bg)] text-[var(--felt-text)] overflow-hidden select-none transition-colors duration-500"
    >
      {/* Top Header */}
      <HeaderBar />

      {/* Main Felt Canvas */}
      <main className="flex-1 relative flex flex-col overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        {/* Felt Table Surface Oval & Rail */}
        <div
          className="relative flex-1 w-full max-w-6xl mx-auto rounded-[3rem] sm:rounded-[4.5rem] border-[8px] sm:border-[10px] shadow-[inset_0_0_120px_rgba(0,0,0,0.9),0_15px_45px_rgba(0,0,0,0.8)] flex flex-col justify-between p-2 sm:p-6 pb-2 transition-all duration-500 min-h-[500px]"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--felt-surface-from) 0%, var(--felt-surface-via) 50%, var(--felt-surface-to) 100%)",
            borderColor: "var(--felt-rail)",
          }}
        >
          {/* Table Watermark & Rules Info */}
          <div className="absolute inset-x-0 top-[26%] flex flex-col items-center justify-center pointer-events-none opacity-25 text-center z-0">
            <span
              className="text-xs sm:text-sm font-black tracking-[0.3em] uppercase"
              style={{ color: "var(--felt-accent)" }}
            >
              TEXAS HOLD'EM NO LIMIT
            </span>
            <span
              className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase mt-0.5"
              style={{ color: "var(--felt-text)" }}
            >
              Blinds ₹{currentView.config.smallBlind} / ₹{currentView.config.bigBlind}
            </span>
            <span
              className="text-[9px] font-mono tracking-wider uppercase mt-0.5 opacity-80"
              style={{ color: "var(--felt-text)" }}
            >
              Table #{currentView.roomCode} • Hand #{currentView.handNumber}
            </span>
          </div>

          {/* Table Paused / Reconnect Banner */}
          {currentView.isPaused && (
            <div className="relative z-30 mx-auto mb-2 flex items-center gap-2 bg-amber-950/90 border border-amber-500/80 px-4 py-2 rounded-2xl text-xs text-amber-100 shadow-xl backdrop-blur max-w-lg text-center animate-fade-in">
              <span className="text-base shrink-0">⏸</span>
              <div className="flex-1">
                <span className="font-bold block text-amber-300">Game Paused</span>
                <span className="text-[10px] text-amber-200/80 block">
                  Action timers are currently frozen.
                </span>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={() => resume()}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-transform active:scale-95 shrink-0"
                >
                  ▶ Resume
                </button>
              )}
            </div>
          )}

          {/* Low Stack / Rebuy Banner */}
          {canRebuy && (
            <div className="relative z-30 mx-auto mb-2 flex items-center gap-2 bg-amber-950/80 border border-amber-500/70 px-4 py-1.5 rounded-xl text-xs text-amber-200 shadow-lg animate-pulse">
              <span>Your stack is below the big blind!</span>
              <button
                type="button"
                onClick={() => openModal("rebuy")}
                className="px-2.5 py-1 rounded-lg bg-gold-400 hover:bg-gold-300 text-black font-bold text-[11px] shadow transition-transform active:scale-95"
              >
                Request Rebuy
              </button>
            </div>
          )}

          {/* Center Community Area */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="pointer-events-auto">
              <PokerCommunityArea
                communityCards={currentView.communityCards}
                pots={currentView.pots}
                street={currentView.street}
                phase={currentView.phase}
                tableStatusMessage={currentView.tableStatusMessage}
              />

              {/* Showdown / Hand Winners Celebration Overlay */}
              <AnimatePresence>
                {currentView.winners && currentView.winners.length > 0 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 15 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="mt-3 bg-black/85 backdrop-blur-md border-2 border-gold-400 px-4 py-2.5 rounded-2xl shadow-[0_0_25px_rgba(212,175,55,0.5)] flex flex-col items-center gap-1.5 text-center select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">🏆</span>
                      <span className="text-xs sm:text-sm font-black text-gold-300">
                        {currentView.winners
                          .map((w) => {
                            const p = currentView.players.find((pl) => pl.id === w.playerId);
                            return `${p?.displayName ?? w.playerId} won ₹${w.amount.toLocaleString()} with ${w.handName}`;
                          })
                          .join(" • ")}
                      </span>
                    </div>

                    {/* Host Manual Next Hand Button */}
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => pokerNextHand()}
                        className="mt-1 px-4 py-1 rounded-xl bg-gold-400 hover:bg-gold-300 active:scale-95 text-black font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                      >
                        <span>Next Hand</span>
                        <span>➔</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Seats Arranged Around the Oval Rail */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {orderedSeats.map((seatNum, slotIdx) => {
              const pos = SEAT_POSITIONS_9[slotIdx % SEAT_POSITIONS_9.length] ?? { left: "50%", top: "50%" };
              const player = currentView.players.find((p) => p.seatNumber === seatNum) ?? null;
              const isMe = player?.id === myPlayerId;
              const isDealerButton = currentView.dealerButtonSeat === seatNum;
              const isSmallBlind = currentView.smallBlindSeat === seatNum;
              const isBigBlind = currentView.bigBlindSeat === seatNum;

              return (
                <div
                  key={`poker-seat-slot-${seatNum}`}
                  className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: pos.left, top: pos.top }}
                >
                  <PokerSeatView
                    seatNumber={seatNum}
                    player={player}
                    isMe={isMe}
                    isDealerButton={isDealerButton}
                    isSmallBlind={isSmallBlind}
                    isBigBlind={isBigBlind}
                    canSit={isSpectator && !player}
                    actionDeadline={player?.isTurn ? currentView.actionDeadline : null}
                    onSit={() => sit(seatNum)}
                    dealOrder={slotIdx}
                    totalSeated={orderedSeats.length}
                    handNumber={currentView.handNumber}
                    className={isMe ? "scale-105 sm:scale-110" : "scale-90 sm:scale-100"}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Pinned Bottom Thumb Reach Action Bar (for seated hero) */}
      {!isSpectator && myPlayer && (
        <div className="relative z-30 p-2 sm:p-3 pb-4">
          <PokerActionBar
            isMyTurn={isMyTurn}
            legalActions={currentView.myLegalActions}
            toCall={toCall}
            currentBet={currentView.currentBet}
            minRaise={minRaise}
            heroStack={myPlayer.stack}
            heroCommittedThisRound={heroCommittedThisRound}
            potSize={totalPot}
            bigBlind={currentView.config.bigBlind}
            onFold={pokerFold}
            onCheck={pokerCheck}
            onCall={pokerCall}
            onBet={pokerBet}
            onRaise={pokerRaise}
            onAllIn={pokerAllIn}
          />
        </div>
      )}

      {/* Spectator Prompt if not seated */}
      {isSpectator && (
        <div className="relative z-30 p-2 text-center">
          <span className="text-xs text-emerald-400/80 bg-black/60 px-4 py-1.5 rounded-full border border-emerald-800/60 shadow">
            You are spectating. Click any empty seat to join the game!
          </span>
        </div>
      )}

      {/* Slide-overs & Modals */}
      <ChatDrawer />
      <HostPanelModal />
      <StandingsModal />
      <RebuyModal />
      <SettingsModal />
    </div>
  );
};
